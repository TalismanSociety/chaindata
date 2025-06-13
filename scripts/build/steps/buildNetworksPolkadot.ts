import { FILE } from 'dns'

import { WsRpcHealth } from '../../fetch-external/steps/checkWsRpcs'
import { FILE_CHAINS_EXTRAS_CACHE, FILE_NETWORKS_POLKADOT, FILE_RPC_HEALTH_WEBSOCKET } from '../../shared/constants'
import { DotNetworksConfigFileSchema } from '../../shared/schemas'
import { ChainExtrasCache } from '../../shared/types'
import { parseJsonFile, parseYamlFile } from '../../shared/util'

export const buildNetworksPolkadot = async () => {
  const dotNetworksConfig = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const chainsExtraCache = parseJsonFile(FILE_CHAINS_EXTRAS_CACHE)
  const chainsExtrasCache = parseJsonFile<ChainExtrasCache[]>(FILE_CHAINS_EXTRAS_CACHE)
  const rpcsHealth = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET)

  const dotNetworks = dotNetworksConfig.map((config) => {})
}
