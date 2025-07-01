import {
  FILE_INPUT_COINGECKO_OVERRIDES,
  FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_INPUT_NETWORKS_POLKADOT,
} from '../../shared/constants'
import { parseYamlFile } from '../../shared/parseFile'
import {
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  KnownEthNetworksOverridesFileSchema,
} from '../../shared/schemas'
import { CoingeckoOverridesFileSchema } from '../../shared/schemas/CoingeckoOverrides'

export const validateConfigFiles = () => {
  parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  parseYamlFile(FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, KnownEthNetworksOverridesFileSchema)
  parseYamlFile(FILE_INPUT_COINGECKO_OVERRIDES, CoingeckoOverridesFileSchema)
}
