import { createClient } from '@polkadot-api/substrate-client'
import { PromisePool } from '@supercharge/promise-pool'
import { getWsProvider } from 'polkadot-api/ws'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_NETWORKS_SPECS_POLKADOT } from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import { DotNetworkSpecsFileSchema, DotNetworkSpecsSchema, DotNetworksConfigFileSchema } from '../../shared/schemas'
import { validateDebug } from '../../shared/validate'
import { withTimeout } from '../../shared/withTimeout'
import { writeJsonFile } from '../../shared/writeFile'

export const fetchDotNetworksSpecs = async () => {
  const dotNetworks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)

  const oldDotNetworkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)

  const networksToUpdate = dotNetworks
    .map(({ id }) => ({
      id,
      rpcs: getRpcsByStatus(id, 'polkadot', 'OK'),
    }))
    .filter(({ rpcs }) => !!rpcs.length)

  console.log(
    'fetchDotNetworksInfos processing %s networks (total:%s invalid:%s)',
    networksToUpdate.length,
    dotNetworks.length,
    dotNetworks.length - networksToUpdate.length,
  )

  const result = await PromisePool.withConcurrency(4)
    .for(networksToUpdate)
    .process((network) =>
      withTimeout(() => fetchNetworkSpecs(network), 30_000, 'Failed to fetch network specs for ' + network.id),
    )

  for (const error of result.errors) console.warn(error.message)
  console.log(
    'fetchDotNetworksInfos processed %s networks (success:%s errors:%s)',
    networksToUpdate.length,
    result.results.length,
    result.errors.length,
  )

  const data = oldDotNetworkSpecs
    .filter(({ id }) => !result.results.some((networkSpecs) => networkSpecs.id === id))
    .concat(result.results)
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeJsonFile(FILE_NETWORKS_SPECS_POLKADOT, data, {
    schema: DotNetworkSpecsFileSchema,
  })
}

const fetchNetworkSpecs = async (network: { id: string; rpcs: string[] }) => {
  // polkadot-api's ws provider replaces @polkadot/rpc-provider's WsProvider: it accepts the rpc array
  // for native failover, its logger defaults to a no-op (no "API-WS: disconnected ... 1002" spam) and
  // client.destroy() tears the connection down cleanly. We use the low-level @polkadot-api/substrate-client
  // (raw request/response) rather than polkadot-api's high-level createClient to avoid the eager
  // chainHead_follow subscription that rejects on destroy and crashes the process.
  const client = createClient(getWsProvider(network.rpcs))

  try {
    const [name, chainType, genesisHash, runtimeVersion, properties] = await Promise.all([
      client.request<any>('system_chain', []),
      client.request<string | { Custom: string }>('system_chainType', []),
      client.request<any>('chain_getBlockHash', [0]),
      client.request<any>('state_getRuntimeVersion', []),
      client.request<any>('system_properties', []),
    ])

    return validateDebug(
      {
        id: network.id,
        name,
        isTestnet: chainType !== 'Live' || undefined,
        genesisHash,
        runtimeVersion,
        properties,
      },
      DotNetworkSpecsSchema,
      'network specs ' + network.id,
    )
  } catch (cause) {
    throw new Error(`Failed to fetch network info for ${network.id}`, { cause })
  } finally {
    client.destroy()
  }
}
