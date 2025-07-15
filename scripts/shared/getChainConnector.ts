import { WsProvider } from '@polkadot/rpc-provider'
import { ChainConnector } from '@talismn/chain-connector'

export const getChainConnectorStub = (provider: WsProvider) =>
  ({
    send: (networkId: string, method: string, params: unknown[], isCacheable?: boolean) =>
      provider.send(method, params, isCacheable),
  }) as ChainConnector
