import {
  FILE_INPUT_COINGECKO_OVERRIDES,
  FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_INPUT_NETWORKS_POLKADOT,
} from './shared/constants'
import { parseYamlFile } from './shared/parseFile'
import {
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  KnownEthNetworksOverridesFileSchema,
} from './shared/schemas'
import { CoingeckoOverridesFileSchema } from './shared/schemas/CoingeckoOverrides'

parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
console.log(`${FILE_INPUT_NETWORKS_POLKADOT} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
console.log(`${FILE_INPUT_NETWORKS_ETHEREUM} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, KnownEthNetworksOverridesFileSchema)
console.log(`${FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_COINGECKO_OVERRIDES, CoingeckoOverridesFileSchema)
console.log(`${FILE_INPUT_COINGECKO_OVERRIDES} schema validation completed successfully.`)
