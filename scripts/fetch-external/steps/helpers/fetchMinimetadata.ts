import { WsProvider } from '@polkadot/rpc-provider'
import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { defaultBalanceModules, deriveMiniMetadataId, MiniMetadata } from '@talismn/balances'
import { ChainConnector } from '@talismn/chain-connector'
import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import {
  ChaindataProvider,
  ChainId,
  DotNetwork,
  EvmNetworkId,
  IChaindataProvider,
  Network,
  TokenId,
} from '@talismn/chaindata-provider'
import { from, of } from 'rxjs'

import { BALANCES_LIB_VERSION, RPC_REQUEST_TIMEOUT } from '../../../shared/constants'
import { DotNetworkConfig, DotNetworkSpecs } from '../../../shared/schemas'
import { withTimeout } from '../../../shared/util'

const libVersion = BALANCES_LIB_VERSION

export const fetchMiniMetadatas = async (
  network: DotNetworkConfig,
  networkSpecs: DotNetworkSpecs,
  provider: WsProvider,
  metadataRpc: `0x${string}`,
) => {
  // TODO: Remove this hack
  //
  // We don't actually have the derived `Chain` at this point, only the `ConfigChain`.
  // But the module only needs access to the `isTestnet` value of the `Chain`, which we do already have.
  //
  // So, we will provide the `isTestnet` value using a hacked together `ChaindataProvider` interface.
  //
  // But if the balance module tries to access any other `ChaindataProvider` features with our hacked-together
  // implementation, it will throw an error. This is fine.
  const { chainConnectors, stubChaindataProvider } = getHackedBalanceModuleDeps(network, provider)

  const miniMetadatas: Record<string, MiniMetadata> = {}
  const tokens: Record<string, any> = {}

  for (const mod of defaultBalanceModules
    .map((mod) => mod({ chainConnectors, chaindataProvider: stubChaindataProvider as unknown as ChaindataProvider }))
    .filter((mod) => mod.type.startsWith('substrate-'))) {
    const source = mod.type as keyof DotNetworkConfig['balancesConfig']
    const chainId = network.id
    const moduleConfig = network.balancesConfig?.[source] ?? {}

    const { specVersion } = networkSpecs.runtimeVersion

    const chainMeta = await mod.fetchSubstrateChainMeta(network.id, moduleConfig ?? {}, metadataRpc)

    const miniMetadata: MiniMetadata = {
      id: deriveMiniMetadataId({
        source,
        chainId,
        specVersion,
        libVersion,
      }),
      source,
      chainId,
      specVersion, // this should be a number!

      libVersion,
      data: chainMeta?.miniMetadata ?? null,
      extra: chainMeta?.extra ?? null,
    }

    miniMetadatas[miniMetadata.id] = miniMetadata

    const moduleTokens = await mod.fetchSubstrateChainTokens(network.id, chainMeta as never, moduleConfig ?? {})
    Object.assign(tokens, moduleTokens)
  }

  return { miniMetadatas, tokens }
}

const getHackedBalanceModuleDeps = (chain: DotNetworkConfig, provider: WsProvider) => {
  const stubChaindataProvider: IChaindataProvider = {
    // @ts-ignore
    chainsObservable: of([chain as unknown as DotNetwork]),
    chains: () => Promise.resolve([chain as unknown as DotNetwork]),

    networksObservable: of([chain as unknown as Network]),
    networks: () => Promise.resolve([chain as unknown as Network]),

    customNetworksObservable: of([chain as unknown as Network]),
    customNetworks: () => Promise.resolve([chain as unknown as Network]),

    // @ts-ignore
    customChainsObservable: from(Promise.resolve([])),
    customChains: () => Promise.resolve([]),

    // @ts-ignore
    chainIdsObservable: from(Promise.resolve([chain.id])),
    chainIds: () => Promise.resolve([chain.id]),

    networkIdsObservable: from(Promise.resolve([chain.id])),
    networkIds: () => Promise.resolve([chain.id]),

    // @ts-ignore
    chainsByIdObservable: from(Promise.resolve({ [chain.id]: chain as unknown as DotNetwork })),
    chainsById: () => Promise.resolve({ [chain.id]: chain as unknown as DotNetwork }),

    networksByIdObservable: from(Promise.resolve({ [chain.id]: chain as unknown as Network })),
    networksById: () => Promise.resolve({ [chain.id]: chain as unknown as Network }),

    // @ts-ignore
    chainsByGenesisHashObservable: from(Promise.resolve({})),
    chainsByGenesisHash: () => Promise.resolve({}),

    networksByGenesisHashObservable: from(Promise.resolve({})),
    networksByGenesisHash: () => Promise.resolve({}),

    chainById: (chainId: ChainId) => Promise.resolve(chainId === chain.id ? (chain as unknown as DotNetwork) : null),
    chainByGenesisHash: (genesisHash: `0x${string}`) => Promise.resolve(null),

    networkById: (chainId: ChainId) => Promise.resolve(chainId === chain.id ? (chain as unknown as Network) : null),
    networkByGenesisHash: (genesisHash: `0x${string}`) => Promise.resolve(null),

    // @ts-ignore
    evmNetworksObservable: from(Promise.resolve([])),
    evmNetworks: () => Promise.resolve([]),

    // @ts-ignore
    customEvmNetworksObservable: from(Promise.resolve([])),
    customEvmNetworks: () => Promise.resolve([]),

    // @ts-ignore
    evmNetworkIdsObservable: from(Promise.resolve([])),
    evmNetworkIds: () => Promise.resolve([]),

    // @ts-ignore
    evmNetworksByIdObservable: from(Promise.resolve({})),
    evmNetworksById: () => Promise.resolve({}),

    evmNetworkById: (evmNetworkId: EvmNetworkId) => Promise.resolve(null),

    // @ts-ignore
    tokensObservable: from(Promise.resolve([])),
    tokens: () => Promise.resolve([]),

    // @ts-ignore
    customTokensObservable: from(Promise.resolve([])),
    customTokens: () => Promise.resolve([]),

    // @ts-ignore
    tokenIdsObservable: from(Promise.resolve([])),
    tokenIds: () => Promise.resolve([]),

    // @ts-ignore
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

      return withTimeout(
        () => provider.send<T>(method, params, isCacheable),
        RPC_REQUEST_TIMEOUT, // 30 seconds in milliseconds
      )
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
