import { readFile } from 'node:fs/promises'

import { FILE_CHAINDATA, FILE_EVM_NETWORKS, FILE_TESTNETS_CHAINDATA } from '../constants'
import { ConfigChain } from '../types'
import { sharedData } from './_sharedData'

export const loadConfig = async () => {
  // retrieve chains & evmNetworks configuration from this repo
  const [chains, testnetChains, evmNetworks] = await Promise.all([
    readFile(FILE_CHAINDATA).then((data) => JSON.parse(data.toString())),
    readFile(FILE_TESTNETS_CHAINDATA)
      .then((data) => JSON.parse(data.toString()))
      .then((chains) => chains?.map?.((chain: ConfigChain) => ({ ...chain, isTestnet: true }))),
    readFile(FILE_EVM_NETWORKS).then((data) => JSON.parse(data.toString())),
  ])

  if (!Array.isArray(chains) || chains.length < 1) throw new Error(`Failed to load chains config. Aborting update.`)

  if (!Array.isArray(testnetChains) || testnetChains.length < 1)
    throw new Error(`Failed to load testnet chains config. Aborting update.`)

  if (!Array.isArray(evmNetworks) || evmNetworks.length < 1)
    throw new Error(`Failed to load evmNetworks config. Aborting update.`)

  sharedData.chainsConfig = [...chains, ...testnetChains]
  sharedData.evmNetworksConfig = evmNetworks
}
