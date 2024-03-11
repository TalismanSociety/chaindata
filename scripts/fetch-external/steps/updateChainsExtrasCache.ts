import { readFile, writeFile } from 'node:fs/promises'

import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { Metadata, TypeRegistry } from '@polkadot/types'
import { PromisePool } from '@supercharge/promise-pool'
import { MiniMetadata, defaultBalanceModules, deriveMiniMetadataId } from '@talismn/balances'
import { ChainConnector } from '@talismn/chain-connector'
import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import {
  Chain,
  ChainId,
  ChaindataProvider,
  EvmNetworkId,
  IChaindataProvider,
  TokenId,
} from '@talismn/chaindata-provider'
import isEqual from 'lodash/isEqual'
import prettier from 'prettier'
import { from } from 'rxjs'

import {
  FILE_CHAINDATA,
  FILE_CHAINS_EXTRAS_CACHE,
  FILE_TESTNETS_CHAINDATA,
  PROCESS_CONCURRENCY,
  RPC_REQUEST_TIMEOUT,
} from '../../shared/constants'
import { PRETTIER_CONFIG } from '../../shared/constants'
import { TokenDef, setTokenLogo } from '../../shared/setTokenLogo'
import { ChainExtrasCache, ConfigChain } from '../../shared/types'
import { sendWithTimeout } from '../../shared/util'

export const updateChainsExtrasCache = async () => {
  const mainnets = JSON.parse(await readFile(FILE_CHAINDATA, 'utf-8')) as ConfigChain[]
  const testnets = JSON.parse(await readFile(FILE_TESTNETS_CHAINDATA, 'utf-8')) as ConfigChain[]
  const chainsExtrasCache = JSON.parse(await readFile(FILE_CHAINS_EXTRAS_CACHE, 'utf-8')) as ChainExtrasCache[]

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
      JSON.stringify(existingCache.balancesConfig) !== JSON.stringify(chain.balancesConfig)

    // no need to do anything else if this chain's extras are already cached
    if (!specChanged) return true

    console.log(`Updating extras for chain ${chain.id}`)

    // fetch extra rpc data
    const [metadataRpc, chainProperties] = await sendWithTimeout(
      rpcUrl,
      [
        ['state_getMetadata', []],
        ['system_properties', []],
        // // TODO: Get parachainId from storage
        // ['state_getStorage', ['0x0d715f2646c8f85767b5d2764bb2782604a74d81251e398fd8a0a4d55023bb3f']],
      ],
      RPC_REQUEST_TIMEOUT,
    )

    const metadata: Metadata = new Metadata(new TypeRegistry(), metadataRpc)
    metadata.registry.setMetadata(metadata)

    const { ss58Format } = chainProperties
    const ss58Prefix = metadata.registry.chainSS58
    const prefix = typeof ss58Prefix === 'number' ? ss58Prefix : typeof ss58Format === 'number' ? ss58Format : 42

    const chainExtrasCache: ChainExtrasCache = {
      id: chain.id,
      genesisHash,
      prefix,
      chainName,
      chainType,
      implName,
      specName,
      specVersion,
      balancesConfig: chain.balancesConfig,

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

      const metadata: any = await mod.fetchSubstrateChainMeta(chain.id, moduleConfig ?? {}, metadataRpc)
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
