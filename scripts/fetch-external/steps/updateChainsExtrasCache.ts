import { readFile, writeFile } from 'node:fs/promises'

import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { Metadata, TypeRegistry } from '@polkadot/types'
import { encodeAddress, xxhashAsHex } from '@polkadot/util-crypto'
import { PromisePool } from '@supercharge/promise-pool'
import { defaultBalanceModules, deriveMiniMetadataId, MiniMetadata } from '@talismn/balances'
import { ChainConnector } from '@talismn/chain-connector'
import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import {
  Chain,
  ChaindataProvider,
  ChainId,
  EvmNetworkId,
  IChaindataProvider,
  TokenId,
} from '@talismn/chaindata-provider'
import { decodeMetadata, decodeScale, toHex } from '@talismn/scale'
import isEqual from 'lodash/isEqual'
import prettier from 'prettier'
import { from } from 'rxjs'
import { Bytes, Option, u32 } from 'scale-ts'

import {
  FILE_CHAINDATA,
  FILE_CHAINS_EXTRAS_CACHE,
  FILE_TESTNETS_CHAINDATA,
  PRETTIER_CONFIG,
  PROCESS_CONCURRENCY,
  RPC_REQUEST_TIMEOUT,
} from '../../shared/constants'
import { setTokenLogo, TokenDef } from '../../shared/setTokenLogo'
import { ChainExtrasCache, ConfigChain } from '../../shared/types'
import { sendWithTimeout } from '../../shared/util'

export const updateChainsExtrasCache = async () => {
  const mainnets = JSON.parse(await readFile(FILE_CHAINDATA, 'utf-8')) as ConfigChain[]
  const testnets = JSON.parse(await readFile(FILE_TESTNETS_CHAINDATA, 'utf-8')) as ConfigChain[]
  const chainsExtrasCache = JSON.parse(
    await (async () => {
      try {
        return await readFile(FILE_CHAINS_EXTRAS_CACHE, 'utf-8')
      } catch (error) {
        console.error('Failed to read chains extras cache', error)
        return '[]'
      }
    })(),
  ) as ChainExtrasCache[]

  const chains = [...mainnets, ...testnets.map((testnet) => ({ ...testnet, isTestnet: true }))]
  const chainIdExists = Object.fromEntries(chains.map((chain) => [chain.id, true] as const))
  const fetchDataForChain = createDataFetcher({ chains, chainsExtrasCache })

  // PromisePool lets us run `fetchChainExtras` on all of the chains in parallel,
  // but with a max limit on how many chains we are fetching data for at the same time
  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(chains.map((chain) => chain.id))
    .process(fetchDataForChain)

  chainsExtrasCache.sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    FILE_CHAINS_EXTRAS_CACHE,
    await prettier.format(
      JSON.stringify(
        chainsExtrasCache.filter((chain) => chainIdExists[chain.id]),
        null,
        2,
      ),
      {
        ...PRETTIER_CONFIG,
        parser: 'json',
      },
    ),
  )
}

const createDataFetcher =
  ({ chains, chainsExtrasCache }: { chains: ConfigChain[]; chainsExtrasCache: ChainExtrasCache[] }) =>
  async (chainId: ChainId, index: number): Promise<void> => {
    console.log(`Checking for extras updates for chain ${index + 1} of ${chains.length} (${chainId})`)

    // fetch extras for chain
    // makes use of the chain rpcs
    await fetchChainExtras(chainId, chains, chainsExtrasCache)
  }

const fetchChainExtras = async (chainId: ChainId, chains: ConfigChain[], chainsExtrasCache: ChainExtrasCache[]) => {
  const chain = chains.find((chain) => chain.id === chainId)
  const rpcs = chain?.rpcs
  if (!rpcs) return

  const maxAttempts = rpcs.length * 2 // attempt each rpc twice, at most
  if (maxAttempts === 0) return

  let success = false
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    success = await attemptToFetchChainExtras(
      chain,
      rpcs[(attempt - 1) % rpcs.length],
      attempt,
      maxAttempts,
      chainsExtrasCache,
    )

    // if chain has been successfully updated, exit the loop here
    if (success) break
  }

  // ran out of attempts
  if (!success) console.warn(`Fetching extras for chain ${chain.id}: all attempts (${maxAttempts}) failed`)
}

const attemptToFetchChainExtras = async (
  chain: ConfigChain,
  rpcUrl: string,
  attempt: number,
  maxAttempts: number,
  chainsExtrasCache: ChainExtrasCache[],
): Promise<boolean> => {
  try {
    // fetch initial rpc data
    const [genesisHash, runtimeVersion, chainName, chainType] = await sendWithTimeout(
      rpcUrl,
      [
        ['chain_getBlockHash', [0]],
        ['state_getRuntimeVersion', []],
        ['system_chain', []],
        ['system_chainType', []],
      ],
      RPC_REQUEST_TIMEOUT,
    )

    // deconstruct rpc data
    const { specName, implName } = runtimeVersion
    const specVersion = String(runtimeVersion.specVersion)

    const existingCache = chainsExtrasCache.find((cc) => cc.id === chain.id) ?? null
    const specChanged =
      !existingCache ||
      existingCache.genesisHash !== genesisHash ||
      existingCache.chainName !== chainName ||
      !isEqual(existingCache.chainType, chainType) ||
      existingCache.implName !== implName ||
      existingCache.specName !== specName ||
      existingCache.specVersion !== specVersion ||
      existingCache.cacheBalancesConfigHash !== xxhashAsHex(JSON.stringify(chain.balancesConfig)) ||
      existingCache.hasCheckMetadataHash === undefined

    // no need to do anything else if this chain's extras are already cached
    if (!specChanged) return true

    console.log(`Updating extras for chain ${chain.id}`)

    const fetchMetadata = async () => {
      const errors: { v15: null | unknown; v14: null | unknown } = { v15: null, v14: null }

      try {
        const [response] = await sendWithTimeout(
          rpcUrl,
          [['state_call', ['Metadata_metadata_at_version', toHex(u32.enc(15))]]],
          RPC_REQUEST_TIMEOUT,
        )
        const result = response ? Option(Bytes()).dec(response) : null
        if (result) return result
      } catch (v15Cause) {
        errors.v15 = v15Cause
      }

      try {
        const [response] = await sendWithTimeout(rpcUrl, [['state_getMetadata', []]], RPC_REQUEST_TIMEOUT)
        if (response) return response
      } catch (v14Cause) {
        errors.v14 = v14Cause
      }

      console.warn(`Failed to fetch both metadata v15 and v14 for chain ${chain.id}`, errors.v15, errors.v14)
      return null
    }

    // fetch extra rpc data
    const [metadataRpc, [systemProperties]] = await Promise.all([
      fetchMetadata(),
      sendWithTimeout(
        rpcUrl,
        [
          ['system_properties', []],
          // // TODO: Get parachainId from storage
          // ['state_getStorage', ['0x0d715f2646c8f85767b5d2764bb2782604a74d81251e398fd8a0a4d55023bb3f']],
        ],
        RPC_REQUEST_TIMEOUT,
      ),
    ])

    const metadata: Metadata = new Metadata(new TypeRegistry(), metadataRpc)
    metadata.registry.setMetadata(metadata)

    const isValidSs58Prefix = (ss58Prefix: number | undefined) => {
      const canEncodeWithPrefix = (ss58Prefix: number) => {
        try {
          encodeAddress('5CcU6DRpocLUWYJHuNLjB4gGyHJrkWuruQD5XFbRYffCfSAP', ss58Prefix)
          return true
        } catch {
          return false
        }
      }
      return typeof ss58Prefix === 'number' && canEncodeWithPrefix(ss58Format)
    }

    const { ss58Format } = systemProperties
    const ss58Prefix = metadata.registry.chainSS58
    const prefix = isValidSs58Prefix(ss58Prefix) ? ss58Prefix : isValidSs58Prefix(ss58Format) ? ss58Format : 42
    const hasCheckMetadataHash = chain.hasCheckMetadataHash ?? getHasCheckMetadataHash(metadata)
    const account = getAccountType(metadataRpc, chain.id)

    const chainExtrasCache: ChainExtrasCache = {
      id: chain.id,
      account,
      genesisHash,
      prefix,
      chainName,
      chainType,
      implName,
      specName,
      specVersion,
      hasCheckMetadataHash,
      cacheBalancesConfigHash: xxhashAsHex(JSON.stringify(chain.balancesConfig)),

      // Note: These should always be cleared back to an empty `{}` when they need to be updated.
      // i.e. when an update is needed, don't persist the previous cached miniMetadatas/tokens under any circumstances.
      miniMetadatas: {},
      tokens: {},
    }

    // TODO: Remove this hack
    //
    // We don't actually have the derived `Chain` at this point, only the `ConfigChain`.
    // But the module only needs access to the `isTestnet` value of the `Chain`, which we do already have.
    //
    // So, we will provide the `isTestnet` value using a hacked together `ChaindataProvider` interface.
    //
    // But if the balance module tries to access any other `ChaindataProvider` features with our hacked-together
    // implementation, it will throw an error. This is fine.
    const { chainConnectors, stubChaindataProvider } = getHackedBalanceModuleDeps(chain, rpcUrl)
    for (const mod of defaultBalanceModules
      .map((mod) => mod({ chainConnectors, chaindataProvider: stubChaindataProvider as unknown as ChaindataProvider }))
      .filter((mod) => mod.type.startsWith('substrate-'))) {
      const moduleConfig = chain.balancesConfig?.[mod.type]

      // update logos in balancesConfig
      // TODO: Refactor so we don't need to do this here
      const configTokens: TokenDef[] = []
      if (moduleConfig !== undefined) {
        if ('tokens' in moduleConfig && Array.isArray(moduleConfig.tokens)) configTokens.push(...moduleConfig.tokens)
        else configTokens.push(moduleConfig)

        for (const token of configTokens) {
          setTokenLogo(token, chain.id, mod.type)
        }
      }

      const metadata: any = await mod.fetchSubstrateChainMeta(
        chain.id,
        moduleConfig ?? {},
        metadataRpc,
        systemProperties,
      )
      const tokens = await mod.fetchSubstrateChainTokens(chain.id, metadata, moduleConfig ?? {})

      const { miniMetadata: data, metadataVersion: version, ...extra } = metadata ?? {}
      const miniMetadata: MiniMetadata = {
        id: deriveMiniMetadataId({
          source: mod.type,
          chainId: chain.id,
          specName,
          specVersion,
          balancesConfig: JSON.stringify(moduleConfig ?? {}),
        }),
        source: mod.type,
        chainId: chain.id,
        specName,
        specVersion,
        balancesConfig: JSON.stringify(moduleConfig ?? {}),
        // TODO: Standardise return value from `fetchSubstrateChainMeta`
        version,
        data,
        extra: JSON.stringify(extra),
      }

      chainExtrasCache.miniMetadatas[miniMetadata.id] = miniMetadata
      chainExtrasCache.tokens = { ...chainExtrasCache.tokens, ...tokens }
    }

    if (existingCache) chainsExtrasCache.splice(chainsExtrasCache.indexOf(existingCache), 1) // remove existing, if exists
    chainsExtrasCache.push(chainExtrasCache) // insert new

    return true
  } catch (error) {
    console.warn(
      `Fetching extras for chain ${chain.id}: attempt ${attempt} of ${maxAttempts} failed: ${
        (error as Error)?.message ?? error
      } (${rpcUrl})`,
    )
  }

  // update was unsuccessful
  return false
}

const getHackedBalanceModuleDeps = (chain: ConfigChain, rpcUrl: string) => {
  const stubChaindataProvider: IChaindataProvider = {
    chainsObservable: from(Promise.resolve([chain as unknown as Chain])),
    chains: () => Promise.resolve([chain as unknown as Chain]),

    customChainsObservable: from(Promise.resolve([])),
    customChains: () => Promise.resolve([]),

    chainIdsObservable: from(Promise.resolve([chain.id])),
    chainIds: () => Promise.resolve([chain.id]),

    chainsByIdObservable: from(Promise.resolve({ [chain.id]: chain as unknown as Chain })),
    chainsById: () => Promise.resolve({ [chain.id]: chain as unknown as Chain }),

    chainsByGenesisHashObservable: from(Promise.resolve({})),
    chainsByGenesisHash: () => Promise.resolve({}),

    chainById: (chainId: ChainId) => Promise.resolve(chainId === chain.id ? (chain as unknown as Chain) : null),
    chainByGenesisHash: (genesisHash: `0x${string}`) => Promise.resolve(null),

    evmNetworksObservable: from(Promise.resolve([])),
    evmNetworks: () => Promise.resolve([]),

    customEvmNetworksObservable: from(Promise.resolve([])),
    customEvmNetworks: () => Promise.resolve([]),

    evmNetworkIdsObservable: from(Promise.resolve([])),
    evmNetworkIds: () => Promise.resolve([]),

    evmNetworksByIdObservable: from(Promise.resolve({})),
    evmNetworksById: () => Promise.resolve({}),

    evmNetworkById: (evmNetworkId: EvmNetworkId) => Promise.resolve(null),

    tokensObservable: from(Promise.resolve([])),
    tokens: () => Promise.resolve([]),

    customTokensObservable: from(Promise.resolve([])),
    customTokens: () => Promise.resolve([]),

    tokenIdsObservable: from(Promise.resolve([])),
    tokenIds: () => Promise.resolve([]),

    tokensByIdObservable: from(Promise.resolve({})),
    tokensById: () => Promise.resolve({}),

    tokenById: (tokenId: TokenId) => Promise.resolve(null),
  }
  const stubChainConnector = {
    asProvider(chainId: ChainId): ProviderInterface {
      throw new Error('asProvider method not supported by stubChainConnector')
    },

    async send<T = any>(
      chainId: ChainId,
      method: string,
      params: unknown[],
      isCacheable?: boolean | undefined,
    ): Promise<T> {
      if (chainId !== chain.id) throw new Error(`Chain ${chainId} not supported by stub connector`)

      return (await sendWithTimeout(rpcUrl, [[method, params]]))[0]
    },

    async subscribe(
      chainId: ChainId,
      subscribeMethod: string,
      responseMethod: string,
      params: unknown[],
      callback: ProviderInterfaceCallback,
      timeout: number | false = 30_000, // 30 seconds in milliseconds
    ): Promise<(unsubscribeMethod: string) => void> {
      if (chainId !== chain.id) throw new Error(`subscribe method not supported by stubChainConnector`)

      return () => {}
    },
  }
  const stubChainConnectorEvm = new ChainConnectorEvm({} as any)
  const chainConnectors = {
    substrate: stubChainConnector as ChainConnector,
    evm: stubChainConnectorEvm,
  }

  return { chainConnectors, stubChaindataProvider }
}

const getHasCheckMetadataHash = (metadata: Metadata) => {
  try {
    return metadata.asLatest.extrinsic.signedExtensions.some((ext) => ext.identifier.toString() === 'CheckMetadataHash')
  } catch (err) {
    console.error('Failed to check if CheckMetadataHash exists', err)
    return false
  }
}

const getAccountType = (metadataRpc: string, chainId?: string) => {
  const { metadata } = decodeMetadata(metadataRpc)
  if (!metadata) {
    console.error(`Failed to detect account type for ${chainId}`)
    return '*25519'
  }

  const system = metadata.pallets.find((p) => p.name === 'System')
  const account = system?.storage?.items.find((s) => s.name === 'Account')
  const storage = account?.type
  if (storage?.tag !== 'map') {
    console.error(`Failed to detect account type for ${chainId}`)
    return '*25519'
  }

  const args = metadata.lookup.at(storage.value.key)
  if (!args) {
    console.error(`Failed to detect account type for ${chainId}`)
    return '*25519'
  }

  const accountType = args.path.slice(-1)[0]
  if (!accountType) {
    console.error(`Failed to detect account type for ${chainId}`)
    return '*25519'
  }

  const isEthereum = accountType === 'AccountId20'
  return isEthereum ? 'secp256k1' : '*25519'
}
