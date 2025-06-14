import { PromisePool } from '@supercharge/promise-pool'

import {
  FILE_CACHE_NETWORKS_SPECS_POLKADOT,
  FILE_NETWORKS_POLKADOT,
  FILE_RPC_HEALTH_WEBSOCKET,
} from '../../shared/constants'
import {
  DotNetworksConfigFileSchema,
  DotNetworkSpecs,
  DotNetworkSpecsFileSchema,
  DotNetworkSpecsSchema,
} from '../../shared/schemas'
import { getRpcProvider, parseJsonFile, parseYamlFile, writeJsonFile } from '../../shared/util'
import { WsRpcHealth } from './checkWsRpcs'

export const fetchDotNetworksSpecs = async () => {
  const dotNetworkSpecs = parseJsonFile(FILE_CACHE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const dotNetworks = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const rpcsHealth = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET)

  const networksWithRpcs = dotNetworks
    .map(({ id, rpcs }) => ({
      id,
      rpcs: rpcs?.filter((rpc) => rpcsHealth[rpc] === 'OK') ?? [],
    }))
    .filter(({ rpcs }) => !!rpcs.length)

  console.log(
    'fetchDotNetworksInfos processing %s networks (total:%s invalid:%s)',
    networksWithRpcs.length,
    dotNetworks.length,
    dotNetworks.length - networksWithRpcs.length,
  )

  const result = await PromisePool.withConcurrency(4).for(networksWithRpcs).process(fetchNetworkInfo)

  console.log(
    'fetchDotNetworksInfos processed %s networks success:%s errors:%s',
    networksWithRpcs.length,
    result.results.length,
    result.errors.length,
  )

  const newDotNetworkInfos = result.results.filter((info): info is DotNetworkSpecs => !!info)

  const data = dotNetworkSpecs
    .filter(({ id }) => !newDotNetworkInfos.some((newInfo) => newInfo.id === id))
    .concat(newDotNetworkInfos)

  await writeJsonFile(FILE_CACHE_NETWORKS_SPECS_POLKADOT, data, {
    format: true,
    schema: DotNetworkSpecsFileSchema,
  })
}

const fetchNetworkInfo = async (network: { id: string; rpcs: string[] }) => {
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

    return validateNetworkInfo({
      id: network.id,
      name,
      isTestnet: chainType !== 'Live' || undefined,
      genesisHash,
      runtimeVersion,
      properties,
    })
  } catch (cause) {
    // console.log('Failed to fetch network info for %s: %s', network.id, err)
    throw new Error(`Failed to fetch network info for ${network.id}`, { cause })
  } finally {
    await provider.disconnect()
  }
}

const validateNetworkInfo = (networkInfo: DotNetworkSpecs): DotNetworkSpecs => {
  try {
    return DotNetworkSpecsSchema.parse(networkInfo)
  } catch (err) {
    console.error('Failed to validate network info:', networkInfo)
    // console.error((err as ZodError))
    throw new Error(`Invalid network info for ${networkInfo.id}`)
  }
}
