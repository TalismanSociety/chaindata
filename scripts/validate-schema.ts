import {
  DotNetworksConfigFileSchema,
  EthNetworksConfigFileSchema,
  KnownEthNetworksOverridesFileSchema,
} from './shared/schemas'
import { parseYamlFile } from './shared/util'

parseYamlFile('data/networks-polkadot.yaml', DotNetworksConfigFileSchema)
console.log('data/networks-polkadot.yaml schema validation completed successfully.')

parseYamlFile('data/networks-ethereum.yaml', EthNetworksConfigFileSchema)
console.log('data/networks-ethereum.yaml schema validation completed successfully.')

parseYamlFile('data/ethereum-known-networks-overrides.yaml', KnownEthNetworksOverridesFileSchema)
console.log('data/ethereum-known-networks-overrides.yaml schema validation completed successfully.')
