import mergeWith from 'lodash/mergeWith'

import { FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, FILE_KNOWN_EVM_NETWORKS } from '../shared/constants'
import {
  KnownEthNetworkConfig,
  KnownEthNetworkOverrides,
  KnownEthNetworksFileSchema,
  KnownEthNetworksOverridesFileSchema,
} from '../shared/schemas'
import { networkMergeCustomizer, parseJsonFile, parseYamlFile } from '../shared/util'

export const getConsolidatedKnownEthNetworks = () => {
  const knownEvmNetworksOverrides = parseYamlFile<KnownEthNetworkOverrides[]>(
    FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
    KnownEthNetworksOverridesFileSchema,
  )
  const knownEvmNetworks = parseJsonFile<KnownEthNetworkConfig[]>(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)

  return knownEvmNetworks.map((network) => {
    const overrides = knownEvmNetworksOverrides.find((ov) => ov.id === network.id)
    return overrides ? mergeWith(network, overrides, networkMergeCustomizer) : network
  })
}
