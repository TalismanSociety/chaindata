import {
  FILE_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
  FILE_NETWORKS_ETHEREUM,
  FILE_NETWORKS_POLKADOT,
} from '../../shared/constants'
import {
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  EthNetworkConfig,
  EthNetworksConfigFileSchema,
  KnownEthNetworkOverrides,
  KnownEthNetworksOverridesFileSchema,
} from '../../shared/schemas'
import { parseYamlFile } from '../../shared/util'

export const validateConfigFiles = () => {
  parseYamlFile<DotNetworkConfig[]>(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  parseYamlFile<EthNetworkConfig[]>(FILE_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  parseYamlFile<KnownEthNetworkOverrides[]>(FILE_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, KnownEthNetworksOverridesFileSchema)
}
