import type { MiniMetadata } from '@talismn/balances'
import { Chain, EvmNetwork, Token } from '@talismn/chaindata-provider'

import { ChainId, ConfigChain, ConfigEvmNetwork, EvmNetworkId } from '../../shared/types'

export const sharedData: {
  chains: Chain[]
  evmNetworks: EvmNetwork[]
  tokens: Token[]
  miniMetadatas: MiniMetadata[]

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
  tokens: [],
  miniMetadatas: [],

  chainsConfig: [],
  evmNetworksConfig: [],
  knownEvmNetworksConfig: [],
  knownEvmNetworksOverridesConfig: [],

  userDefinedThemeColors: {
    chains: new Map(),
    evmNetworks: new Map(),
  },
}
