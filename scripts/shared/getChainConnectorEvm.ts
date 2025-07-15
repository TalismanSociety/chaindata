import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
import { EthNetwork } from '@talismn/chaindata-provider'

import { getEvmNetworkClient } from './getEvmNetworkClient'
import { EthNetworkConfig } from './schemas'

export const getChainConnectorEvm = (networkConfig: EthNetworkConfig) =>
  ({
    getPublicClientForEvmNetwork: () => getEvmNetworkClient(networkConfig as unknown as EthNetwork),
  }) as unknown as ChainConnectorEvm
