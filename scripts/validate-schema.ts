import {
  FILE_INPUT_COINGECKO_OVERRIDES,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_INPUT_NETWORKS_SOLANA,
} from './shared/constants'
import { parseYamlFile } from './shared/parseFile'
import {
  CoingeckoOverridesFileSchema,
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  SolNetworksConfigFileSchema,
} from './shared/schemas'

parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)
console.log(`${FILE_INPUT_NETWORKS_SOLANA} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
console.log(`${FILE_INPUT_NETWORKS_POLKADOT} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
console.log(`${FILE_INPUT_NETWORKS_ETHEREUM} schema validation completed successfully.`)

parseYamlFile(FILE_INPUT_COINGECKO_OVERRIDES, CoingeckoOverridesFileSchema)
console.log(`${FILE_INPUT_COINGECKO_OVERRIDES} schema validation completed successfully.`)
