import { Token } from '@talismn/chaindata'

import { getConsolidatedKnownEthNetworks } from '../../fetch-external/getConsolidatedEthNetworksOverrides'
import { FILE_NETWORKS_ETHEREUM, FILE_NETWORKS_POLKADOT } from '../../shared/constants'
import { DotNetworksConfigFileSchema, EthNetworksConfigFileSchema } from '../../shared/schemas'
import { parseYamlFile } from '../../shared/util'

export const buildTokens = async () => {
  const tokens: Token[] = []

  const dotNetworksConfig = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const ethNetworksConfig = parseYamlFile(FILE_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  for (const network of dotNetworksConfig) {
    // native token
    // tokens.push({
    //     id:
    // })
  }
}
