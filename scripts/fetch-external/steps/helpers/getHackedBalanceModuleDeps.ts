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
  const network = chain as unknown as Network

  const stubChaindataProvider: IChaindataProvider = {
    networks$: of([network]),
    // @ts-expect-error
    getNetworks$: () => of([network]),
    // @ts-expect-error
    getNetworks: () => Promise.resolve([network]),

    getNetworkIds$: () => of([network.id]),
    getNetworkIds: () => Promise.resolve([network.id]),

    // @ts-expect-error
    getNetworksMapById$: () => of({ [network.id]: network }),
    // @ts-expect-error
    getNetworksMapById: () => Promise.resolve({ [network.id]: network }),

    // @ts-expect-error
    getNetworksMapByGenesisHash$: () => of({}),
    getNetworksMapByGenesisHash: () => Promise.resolve({}),

    getNetworkById$: () => of(network),
    // @ts-expect-error
    getNetworkById: () => Promise.resolve(network),

    getNetworkByGenesisHash$: () => of(null),
    getNetworkByGenesisHash: () => Promise.resolve(null),

    tokens$: of([]),
    getTokens$: () => of([]),
    getTokens: () => Promise.resolve([]),

    getTokenIds$: () => of([]),
    getTokenIds: () => Promise.resolve([]),

    getTokensMapById$: () => of({}),
    getTokensMapById: () => Promise.resolve({}),

    getTokensById$: () => of({}),
    getTokensById: () => Promise.resolve({}),
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
