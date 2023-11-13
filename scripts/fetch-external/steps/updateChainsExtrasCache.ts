import { readFile, writeFile } from 'node:fs/promises'

import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { Metadata, TypeRegistry } from '@polkadot/types'
import { PromisePool } from '@supercharge/promise-pool'
import { MiniMetadata, defaultBalanceModules, deriveMiniMetadataId } from '@talismn/balances'
import { ChainConnector } from '@talismn/chain-connector'
import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import { Chain, ChainId, ChaindataProvider } from '@talismn/chaindata-provider'
import prettier from 'prettier'

import {
  FILE_CHAINDATA,
  FILE_CHAINS_EXTRAS_CACHE,
  FILE_TESTNETS_CHAINDATA,
  PROCESS_CONCURRENCY,
  RPC_REQUEST_TIMEOUT,
} from '../../shared/constants'
import { ChainExtrasCache, ConfigChain } from '../../shared/types'
import { sendWithTimeout } from '../../shared/util'

export const updateChainsExtrasCache = async () => {
  const mainnets = JSON.parse(await readFile(FILE_CHAINDATA, 'utf-8')) as ConfigChain[]
  const testnets = JSON.parse(await readFile(FILE_TESTNETS_CHAINDATA, 'utf-8')) as ConfigChain[]
  const chainsExtrasCache = JSON.parse(await readFile(FILE_CHAINS_EXTRAS_CACHE, 'utf-8')) as ChainExtrasCache[]

  const chains = [...mainnets, ...testnets]
  const fetchDataForChain = createDataFetcher({ chains, chainsExtrasCache })

  // PromisePool lets us run `fetchChainExtras` on all of the chains in parallel,
  // but with a max limit on how many chains we are fetching data for at the same time
  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(chains.map((chain) => chain.id))
    .process(fetchDataForChain)

  await writeFile(
    FILE_CHAINS_EXTRAS_CACHE,
    await prettier.format(JSON.stringify(chainsExtrasCache, null, 2), {
      parser: 'json',
    }),
  )
}

const createDataFetcher =
  ({ chains, chainsExtrasCache }: { chains: ConfigChain[]; chainsExtrasCache: ChainExtrasCache[] }) =>
  async (chainId: ChainId, index: number): Promise<void> => {
    console.log(`Updating extras for chain ${index + 1} of ${chains.length} (${chainId})`)

    // fetch extras for chain
    // makes use of the chain rpcs
    await fetchChainExtras(chainId, chains, chainsExtrasCache)
  }

const fetchChainExtras = async (chainId: ChainId, chains: ConfigChain[], chainsExtrasCache: ChainExtrasCache[]) => {
  const chain = chains.find((chain) => chain.id === chainId)
  if (!chain?.rpcs) return

  const chainExtrasCache = chainsExtrasCache.find((cc) => cc.id === chainId)
  if (chainExtrasCache) {
    try {
      // if specVersion hasn't changed, no need to update
      const [runtimeVersion] = await sendWithTimeout(chain.rpcs, [['state_getRuntimeVersion', []]], RPC_REQUEST_TIMEOUT)
      if (String(runtimeVersion.specVersion) === chainExtrasCache.specVersion) return
    } catch (err) {
      console.log('Failed to fetch runtime version for %s', chainId, (err as any).message ?? 'unknown error')
      return
    }
  }

  const rpcs = chain.rpcs ?? []
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
    // fetch rpc data
    const [genesisHash, runtimeVersion, metadataRpc, chainName, chainProperties] = await sendWithTimeout(
      rpcUrl,
      [
        ['chain_getBlockHash', [0]],
        ['state_getRuntimeVersion', []],
        ['state_getMetadata', []],
        ['system_chain', []],
        ['system_properties', []],
        // // TODO: Get parachainId from storage
        // ['state_getStorage', ['0x0d715f2646c8f85767b5d2764bb2782604a74d81251e398fd8a0a4d55023bb3f']],
      ],
      RPC_REQUEST_TIMEOUT,
    )

    // deconstruct rpc data
    const { specName, specVersion, implName } = runtimeVersion
    const { ss58Format } = chainProperties

    const metadata: Metadata = new Metadata(new TypeRegistry(), metadataRpc)
    metadata.registry.setMetadata(metadata)

    const ss58Prefix = metadata.registry.chainSS58

    const chainExtrasCache: ChainExtrasCache = chainsExtrasCache.find((cc) => cc.id === chain.id) ?? {
      id: chain.id,
      genesisHash,
      prefix: 42,
      chainName,
      implName,
      specName,
      specVersion: '0', // use `'0'` to force metadata update when chain is first created
      miniMetadatas: {},
      tokens: {},
    }

    const specChanged =
      chainExtrasCache.genesisHash !== genesisHash ||
      chainExtrasCache.chainName !== chainName ||
      chainExtrasCache.implName !== implName ||
      chainExtrasCache.specName !== specName ||
      chainExtrasCache.specVersion !== String(specVersion)

    // set values
    chainExtrasCache.genesisHash = genesisHash
    chainExtrasCache.prefix =
      typeof ss58Prefix === 'number' ? ss58Prefix : typeof ss58Format === 'number' ? ss58Format : 42
    chainExtrasCache.chainName = chainName
    chainExtrasCache.implName = implName
    chainExtrasCache.specName = specName
    chainExtrasCache.specVersion = String(specVersion)

    if (specChanged) {
      console.log(`Updating metadata for chain ${chain.id}`)

      // Clear any old data
      chainExtrasCache.miniMetadatas = {}
      chainExtrasCache.tokens = {}

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
      for (const mod of defaultBalanceModules.map((mod) =>
        mod({ chainConnectors, chaindataProvider: stubChaindataProvider }),
      )) {
        const moduleConfig = chain.balancesConfig?.[mod.type]
        const metadata: any = await mod.fetchSubstrateChainMeta(chain.id, moduleConfig, metadataRpc)
        const tokens = await mod.fetchSubstrateChainTokens(chain.id, metadata, moduleConfig)

        const { miniMetadata: data, metadataVersion: version, ...extra } = metadata ?? {}
        const miniMetadata: MiniMetadata = {
          id: deriveMiniMetadataId({
            source: mod.type,
            chainId: chain.id,
            specName,
            specVersion,
            balancesConfig: JSON.stringify(moduleConfig),
          }),
          source: mod.type,
          chainId: chain.id,
          specName,
          specVersion,
          balancesConfig: JSON.stringify(moduleConfig),
          // TODO: Standardise return value from `fetchSubstrateChainMeta`
          version,
          data,
          extra: JSON.stringify(extra),
        }

        chainExtrasCache.miniMetadatas[miniMetadata.id] = miniMetadata
        chainExtrasCache.tokens = { ...chainExtrasCache.tokens, ...tokens }
      }
    }

    if (!chainsExtrasCache.includes(chainExtrasCache)) chainsExtrasCache.push(chainExtrasCache)

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
  const stubChaindataProvider: ChaindataProvider = {
    chainIds: () => Promise.resolve([chain.id]),
    chains: () => Promise.resolve({ [chain.id]: chain as unknown as Chain }),
    getChain: (chainId: ChainId) => Promise.resolve(chainId === chain.id ? (chain as unknown as Chain) : null),

    evmNetworkIds: () => Promise.resolve([]),
    evmNetworks: () => Promise.resolve({}),
    getEvmNetwork: () => Promise.resolve(null),

    tokenIds: () => Promise.resolve([]),
    tokens: () => Promise.resolve({}),
    getToken: () => Promise.resolve(null),
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
