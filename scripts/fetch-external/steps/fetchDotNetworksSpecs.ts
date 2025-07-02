import { PromisePool } from '@supercharge/promise-pool'

import { FILE_INPUT_NETWORKS_POLKADOT, FILE_NETWORKS_SPECS_POLKADOT } from '../../shared/constants'
import { getRpcProvider } from '../../shared/getRpcProvider'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import { DotNetworksConfigFileSchema, DotNetworkSpecsFileSchema, DotNetworkSpecsSchema } from '../../shared/schemas'
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
  const provider = getRpcProvider(network.rpcs)

  try {
    await provider.isReady

    const [name, chainType, genesisHash, runtimeVersion, properties] = await Promise.all([
      provider.send('system_chain', []),
      provider.send<string | { Custom: string }>('system_chainType', []),
      provider.send('chain_getBlockHash', [0]),
      provider.send('state_getRuntimeVersion', []),
      provider.send('system_properties', []),
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
    // console.log('Failed to fetch network info for %s: %s', network.id, err)
    throw new Error(`Failed to fetch network info for ${network.id}`, { cause })
  } finally {
    await provider.disconnect()
  }
}
