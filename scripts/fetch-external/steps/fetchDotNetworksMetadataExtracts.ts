import { XcmV3JunctionNetworkId } from '@polkadot-api/descriptors'
import { WsProvider } from '@polkadot/rpc-provider'
import { xxhashAsHex } from '@polkadot/util-crypto'
import { PromisePool } from '@supercharge/promise-pool'
import { fetchBestMetadata } from '@talismn/sapi'
import { decAnyMetadata, getDynamicBuilder, getLookupFn, UnifiedMetadata, unifyMetadata } from '@talismn/scale'
import keyBy from 'lodash/keyBy'
import { cache } from 'sharp'

import {
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
  FILE_RPC_HEALTH_WEBSOCKET,
} from '../../shared/constants'
import {
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  DotNetworkSpecs,
  DotNetworkSpecsFileSchema,
} from '../../shared/schemas'
import {
  DotNetworkMetadataExtract,
  DotNetworkMetadataExtractSchema,
  DotNetworkMetadataExtractsFileSchema,
} from '../../shared/schemas/DotNetworkMetadataExtract'
import {
  getRpcProvider,
  parseJsonFile,
  parseYamlFile,
  validateDebug,
  withTimeout,
  writeJsonFile,
} from '../../shared/util'
import { WsRpcHealth } from './checkWsRpcs'
import { fetchMiniMetadatas } from './helpers/fetchMinimetadata'

// set this to a specific chain id to debug it
const DEV_CHAIN_ID = null // ex: 'hydradx'

export const fetchDotNetworksMetadataExtracts = async () => {
  const oldMetadataExtracts = parseJsonFile(
    FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
    DotNetworkMetadataExtractsFileSchema,
  )
  const dotNetworkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const dotNetworks = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const rpcsHealth = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET)

  const metadataExtractsById = keyBy(oldMetadataExtracts, 'id')
  const specsById = keyBy(dotNetworkSpecs, 'id')

  const networksToUpdate = dotNetworks
    .map((network) => ({
      network,
      rpcs: network.rpcs?.filter((rpc) => rpcsHealth[rpc] === 'OK') ?? [],
      cacheBalancesConfigHash: xxhashAsHex(JSON.stringify(network.balancesConfig)),
      specs: specsById[network.id] as DotNetworkSpecs | undefined,
    }))
    .filter((args): args is FetchMetadataExtractArgs => {
      const { network, rpcs, cacheBalancesConfigHash, specs } = args
      if (!rpcs.length) return false // no rpcs available for this network - cant be updated
      if (!specs) return false // no specs available for this network - cant be updated

      // we need to update only if specVersion or balancesConfigHash changed
      // TODO also update if @talismn/balances version number changed ?
      const metadataExtract = metadataExtractsById[network.id]
      if (!metadataExtract) return true // no metadata extract yet, fetch it

      // if debugging a specific chain, force it to update
      if (DEV_CHAIN_ID && network.id === DEV_CHAIN_ID) return true

      // spec version changed, metadata will be different
      if (metadataExtract.specVersion !== specs.runtimeVersion.specVersion) return true

      // balances config hash changed, miniMetadatas need to be updated
      if (metadataExtract.cacheBalancesConfigHash !== cacheBalancesConfigHash) return true

      return false // no changes, no need to update
    })
    .filter((network) => !DEV_CHAIN_ID || network.network.id === DEV_CHAIN_ID)

  console.log(
    'fetchDotNetworkMetadataExtracts processing %s networks (total:%s invalid:%s)',
    networksToUpdate.length,
    dotNetworks.length,
    dotNetworks.length - networksToUpdate.length,
  )

  const result = await PromisePool.withConcurrency(4)
    .for(networksToUpdate)
    .process((network) =>
      withTimeout(
        () => fetchMetadataExtract(network),
        30_000,
        'Failed to fetch metadata extract for ' + network.network.id,
      ),
    )

  for (const error of result.errors) console.warn(error.message)
  console.log(
    'fetchDotNetworkMetadataExtracts processed %s networks (success:%s errors:%s)',
    networksToUpdate.length,
    result.results.length,
    result.errors.length,
  )

  const data = oldMetadataExtracts
    .filter(({ id }) => !result.results.some((metadataExtract) => metadataExtract.id === id))
    .concat(result.results)
    .sort((a, b) => a.id.localeCompare(b.id))

  // return data // Replace with actual validation when schema is available
  await writeJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, data, {
    format: true,
    schema: DotNetworkMetadataExtractsFileSchema,
  })
}

type FetchMetadataExtractArgs = {
  network: DotNetworkConfig
  rpcs: string[]
  cacheBalancesConfigHash: `0x${string}`
  specs: DotNetworkSpecs
}

const fetchMetadataExtract = async ({
  network,
  cacheBalancesConfigHash,
  specs,
  rpcs,
}: FetchMetadataExtractArgs): Promise<DotNetworkMetadataExtract> => {
  console.log('Fetching metadata extract for network %s', network.id)

  const provider = getRpcProvider(rpcs)

  try {
    await provider.isReady

    const metadataRpc = await fetchBestMetadata(
      (method, params) => provider.send(method, params),
      false, // do not allow fallback, though it will fallback if RPC responds that Metadata runtime api doesn't exist
    )

    const metadata = unifyMetadata(decAnyMetadata(metadataRpc))

    const ss58Prefix = getSs58Prefix(metadata)

    const hasCheckMetadataHash = metadata.extrinsic.signedExtensions.some(
      ({ identifier }) => identifier === 'CheckMetadataHash',
    )

    const account = getAccountType(metadata)

    const { miniMetadatas, tokens } = await fetchMiniMetadatas(network, specs, provider, metadataRpc)

    const topologyInfo = await getTopologyInfo(metadata, provider, network)
    console.log('Topology for network %s: %o', network.id, topologyInfo)

    return validateDebug(
      {
        id: network.id,
        specVersion: specs.runtimeVersion.specVersion,
        account,
        ss58Prefix,
        hasCheckMetadataHash,
        cacheBalancesConfigHash,
        miniMetadatas,
        tokens,
        topologyInfo,
      },
      DotNetworkMetadataExtractSchema,
      'network metadata extract ' + network.id,
    )
  } catch (cause) {
    // decAnyMetadata throws null if metadata version is unsupported
    if (cause === null) console.warn('Unsupported metadata version on network', network.id)
    throw new Error(`Failed to fetch metadata extract for ${network.id}: ${cause}`, { cause })
  } finally {
    await provider.disconnect()
  }
}

const getAccountType = (metadata: UnifiedMetadata) => {
  const system = metadata.pallets.find((p) => p.name === 'System')
  const account = system?.storage?.items.find((s) => s.name === 'Account')
  const storage = account?.type
  if (storage?.tag !== 'map') throw new Error(`Account storage is not a map`)

  const args = metadata.lookup.at(storage.value.key)
  if (!args) throw new Error(`Cannot lookup account type`)

  const accountType = args.path.slice(-1)[0]

  if (!accountType) throw new Error(`Account type not found in metadata`)

  switch (accountType) {
    case 'AccountId32':
      return '*25519'
    case 'AccountId20':
      return 'secp256k1'
    default:
      throw new Error('Unsupported account type: ' + accountType)
  }
}

const getSs58Prefix = (metadata: UnifiedMetadata) => {
  const builder = getDynamicBuilder(getLookupFn(metadata))

  const encodedSs58Prefix = metadata.pallets
    .find((p) => p.name === 'System')
    ?.constants.find((c) => c.name === 'SS58Prefix')?.value
  if (!encodedSs58Prefix) throw new Error(`SS58Prefix constant not found in metadata`)

  const prefix = builder.buildConstant('System', 'SS58Prefix').dec(encodedSs58Prefix) as number

  // metadata's codec is too loose: a prefix needs to be a number between 0 and 16383, and cannot be 46 or 47
  if (prefix < 0 || prefix > 16383 || [46, 47].includes(prefix)) {
    console.warn('Invalid SS58Prefix constant found in metadata (%s), defaulting to 42', prefix)
    return 42
  }
  return prefix
}

const getTopologyInfo = async (
  metadata: UnifiedMetadata,
  provider: WsProvider,
  network: DotNetworkConfig,
): Promise<DotNetworkMetadataExtract['topologyInfo']> => {
  if (metadata.pallets.some((p) => p.name === 'Paras')) {
    if (network.relay && network.id !== network.relay)
      console.warn(`Network ${network.id} has invalid relay property, remove it`)
    return { type: 'relay' }
  }

  const parachainInfo = metadata.pallets.find((p) => p.name === 'ParachainInfo')
  if (parachainInfo) {
    try {
      if (!network.relay) {
        console.warn(`Unknown relay for ${network.id} (plz fill the relay property in networks-polkadot.yaml)`)
        // TODO throw error instead ? can do after v4 launch, we need at least one invalid entry in output file before doing so
        return { type: 'standalone' }
      }

      const builder = getDynamicBuilder(getLookupFn(metadata))
      const codec = builder.buildStorage('ParachainInfo', 'ParachainId')
      const stateKey = codec.keys.enc()
      const hexValue = await provider.send<`0x${string}`>('state_getStorage', [stateKey])
      const paraId = codec.value.dec(hexValue) as number

      return {
        type: 'parachain',
        relayId: network.relay,
        paraId,
      }
    } catch (cause) {
      console.error(cause)
      throw new Error(`Failed to construct parachain info: ${cause}`, { cause })
    }
  }

  if (network.relay) console.warn(`Network ${network.id} has invalid relay property, remove it`)

  return {
    type: 'standalone',
  }
}
