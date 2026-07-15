import { getSolRpc } from '@talismn/chain-connectors'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import { FILE_INPUT_NETWORKS_SOLANA, FILE_NETWORKS_SPECS_SOLANA } from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { SolNetworksConfigFileSchema, SolNetworkSpecsFileSchema } from '../../shared/schemas'
import { writeJsonFile } from '../../shared/writeFile'

export const fetchSolNetworksSpecs = async () => {
  const solNetworksSpecs = parseJsonFile(FILE_NETWORKS_SPECS_SOLANA, SolNetworkSpecsFileSchema)
  const solNetworks = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)

  const networksSpecsById = keyBy(solNetworksSpecs, 'id')

  for (const network of solNetworks) {
    try {
      const rpc = getSolRpc(network.id, network.rpcs)
      const genesisHash = await rpc.getGenesisHash().send()
      networksSpecsById[network.id] = {
        id: network.id,
        genesisHash,
      }
    } catch (err) {
      console.warn(`Failed to fetch genesis hash for network ${network.id}:`, err)
    }
  }

  const newNetworkSpecs = values(networksSpecsById).sort((a, b) => a.id.localeCompare(b.id))

  await writeJsonFile(FILE_NETWORKS_SPECS_SOLANA, newNetworkSpecs, {
    format: true,
    schema: SolNetworkSpecsFileSchema,
  })
}
