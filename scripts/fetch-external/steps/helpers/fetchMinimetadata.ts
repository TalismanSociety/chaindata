import { WsProvider } from '@polkadot/rpc-provider'
import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
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
import { BehaviorSubject, from } from 'rxjs'

import { RPC_REQUEST_TIMEOUT } from '../../../shared/constants'
import { DotNetworkConfig, DotNetworkSpecs } from '../../../shared/schemas'
import { withTimeout } from '../../../shared/util'

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
    const moduleConfig = network.balancesConfig?.[mod.type]

    // update logos in balancesConfig
    // TODO: Refactor so we don't need to do this here
    // const configTokens: TokenDef[] = []
    // if (moduleConfig !== undefined) {
    //     if ('tokens' in moduleConfig && Array.isArray(moduleConfig.tokens)) configTokens.push(...moduleConfig.tokens)
    //     else configTokens.push(moduleConfig)

    //     for (const token of configTokens) {
    //         setTokenLogo(token, chain.id, mod.type)
    //     }
    // }

    const { specName, specVersion } = networkSpecs.runtimeVersion

    const metadata: any = await mod.fetchSubstrateChainMeta(
      network.id,
      moduleConfig ?? {},
      metadataRpc,
      networkSpecs.properties,
    )

    const { miniMetadata: data, metadataVersion: version, ...extra } = metadata ?? {}
    const miniMetadata: MiniMetadata = {
      id: deriveMiniMetadataId({
        source: mod.type,
        chainId: network.id,
        specName,
        specVersion: specVersion.toString(), // this should be a number!
        balancesConfig: JSON.stringify(moduleConfig ?? {}),
      }),
      source: mod.type,
      chainId: network.id,
      specName,
      specVersion: specVersion.toString(), // this should be a number!
      balancesConfig: JSON.stringify(moduleConfig ?? {}),
      // TODO: Standardise return value from `fetchSubstrateChainMeta`
      version,
      data,
      extra: JSON.stringify(extra),
    }

    miniMetadatas[miniMetadata.id] = miniMetadata

    const moduleTokens = await mod.fetchSubstrateChainTokens(network.id, metadata, moduleConfig ?? {})
    Object.assign(tokens, moduleTokens)
  }

  return { miniMetadatas, tokens }
}

const getHackedBalanceModuleDeps = (chain: DotNetworkConfig, provider: WsProvider) => {
  const stubChaindataProvider: IChaindataProvider = {
    // @ts-ignore
    chainsObservable: from([chain as unknown as Chain]), // new BehaviorSubject([chain as unknown as Chain]).asObservable(),
    chains: () => Promise.resolve([chain as unknown as Chain]),

    // @ts-ignore
    customChainsObservable: from(Promise.resolve([])),
    customChains: () => Promise.resolve([]),

    // @ts-ignore
    chainIdsObservable: from(Promise.resolve([chain.id])),
    chainIds: () => Promise.resolve([chain.id]),

    // @ts-ignore
    chainsByIdObservable: from(Promise.resolve({ [chain.id]: chain as unknown as Chain })),
    chainsById: () => Promise.resolve({ [chain.id]: chain as unknown as Chain }),

    // @ts-ignore
    chainsByGenesisHashObservable: from(Promise.resolve({})),
    chainsByGenesisHash: () => Promise.resolve({}),

    chainById: (chainId: ChainId) => Promise.resolve(chainId === chain.id ? (chain as unknown as Chain) : null),
    chainByGenesisHash: (genesisHash: `0x${string}`) => Promise.resolve(null),

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
