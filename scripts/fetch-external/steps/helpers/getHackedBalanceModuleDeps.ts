import { WsProvider } from '@polkadot/rpc-provider'
import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
import { ChainConnector } from '@talismn/chain-connector'
import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import { ChainId, DotNetwork, EvmNetworkId, IChaindataProvider, Network, TokenId } from '@talismn/chaindata-provider'
import { from, of } from 'rxjs'

import { RPC_REQUEST_TIMEOUT } from '../../../shared/constants'
import { DotNetworkConfig } from '../../../shared/schemas'
import { withTimeout } from '../../../shared/util'

export const getHackedBalanceModuleDeps = (chain: DotNetworkConfig, provider: WsProvider) => {
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
