import { readFileSync } from 'fs'

import { NetworkBase } from '@talismn/chaindata-provider'
import { parse } from 'yaml'
import z from 'zod/v4'

import { FILE_NETWORKS_ETHEREUM, FILE_NETWORKS_POLKADOT } from '../../shared/constants'
import { DotNetworkConfig, DotNetworkConfigDef, EthNetworkConfig, EthNetworkConfigDef } from '../../shared/types.v4'
import { parseYamlFile } from '../../shared/util'
import { validateNetworks } from '../../shared/validateNetworks'

export const validateConfigFiles = () => {
  const dotNetworks = parseYamlFile<DotNetworkConfig[]>(FILE_NETWORKS_POLKADOT)
  validateNetworks(dotNetworks, DotNetworkConfigDef)

  const ethNetworks = parseYamlFile<EthNetworkConfig[]>(FILE_NETWORKS_ETHEREUM)
  validateNetworks(ethNetworks, EthNetworkConfigDef)
}
