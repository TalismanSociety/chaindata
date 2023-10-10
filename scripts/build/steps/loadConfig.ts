import { readFile } from 'node:fs/promises'

import {
  FILE_CHAINDATA,
  FILE_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS_OVERRIDES,
  FILE_TESTNETS_CHAINDATA,
} from '../constants'
import { ConfigChain } from '../types'
import { sharedData } from './_sharedData'

export const loadConfig = async () => {
  // retrieve chains & evmNetworks configuration from this repo
  const [chains, testnetChains, evmNetworks, knownEvmNetworks, knownEvmNetworksOverrides] = await Promise.all([
    readFile(FILE_CHAINDATA).then((data) => JSON.parse(data.toString())),
    readFile(FILE_TESTNETS_CHAINDATA)
      .then((data) => JSON.parse(data.toString()))
      .then((chains) => chains?.map?.((chain: ConfigChain) => ({ ...chain, isTestnet: true }))),
    readFile(FILE_EVM_NETWORKS).then((data) => JSON.parse(data.toString())),
    readFile(FILE_KNOWN_EVM_NETWORKS).then((data) => JSON.parse(data.toString())),
    readFile(FILE_KNOWN_EVM_NETWORKS_OVERRIDES).then((data) => JSON.parse(data.toString())),
  ])

  if (!Array.isArray(chains) || chains.length < 1) throw new Error(`Failed to load chains config. Aborting update.`)

  if (!Array.isArray(testnetChains) || testnetChains.length < 1)
    throw new Error(`Failed to load testnet chains config. Aborting update.`)

  if (!Array.isArray(evmNetworks) || evmNetworks.length < 1)
    throw new Error(`Failed to load evmNetworks config. Aborting update.`)

  if (!Array.isArray(knownEvmNetworks) || knownEvmNetworks.length < 1)
    throw new Error(`Failed to load knownEvmNetworks config. Aborting update.`)

  if (!Array.isArray(knownEvmNetworksOverrides) || knownEvmNetworksOverrides.length < 1)
    throw new Error(`Failed to load knownEvmNetworksOverrides config. Aborting update.`)

  sharedData.chainsConfig = [...chains, ...testnetChains]
  sharedData.evmNetworksConfig = evmNetworks
  sharedData.knownEvmNetworksConfig = knownEvmNetworks
  sharedData.knownEvmNetworksOverridesConfig = knownEvmNetworksOverrides
}
