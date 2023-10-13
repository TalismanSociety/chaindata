import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { ChainId, ConfigChain, ConfigEvmNetwork, EvmNetworkId } from '../../shared/types'

export const sharedData: {
  chains: Chain[]
  evmNetworks: EvmNetwork[]

  chainsConfig: ConfigChain[]
  evmNetworksConfig: ConfigEvmNetwork[]
  knownEvmNetworksConfig: ConfigEvmNetwork[]
  knownEvmNetworksOverridesConfig: ConfigEvmNetwork[]

  userDefinedThemeColors: {
    chains: Map<ChainId, string>
    evmNetworks: Map<EvmNetworkId, string>
  }
} = {
  chains: [],
  evmNetworks: [],

  chainsConfig: [],
  evmNetworksConfig: [],
  knownEvmNetworksConfig: [],
  knownEvmNetworksOverridesConfig: [],

  userDefinedThemeColors: {
    chains: new Map(),
    evmNetworks: new Map(),
  },
}
