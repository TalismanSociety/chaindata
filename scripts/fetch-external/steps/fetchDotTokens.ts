import { PromisePool } from '@supercharge/promise-pool'
import { defaultBalanceModules, deriveMiniMetadataId } from '@talismn/balances'
import { ChaindataProvider, DotToken, TokenSchema } from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'
import z from 'zod/v4'

import {
  BALANCES_LIB_VERSION,
  FILE_DOT_TOKENS_CACHE,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
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
  DotNetworkMetadataExtractsFileSchema,
} from '../../shared/schemas/DotNetworkMetadataExtract'
import { getRpcProvider, parseJsonFile, parseYamlFile, withTimeout, writeJsonFile } from '../../shared/util'
import { WsRpcHealth } from './checkWsRpcs'
import { getHackedBalanceModuleDeps } from './helpers/getHackedBalanceModuleDeps'

// set this to a specific chain id to debug it
const DEV_CHAIN_ID = null // ex: 'hydradx'

export const fetchDotTokens = async () => {
  const prevDotTokens = parseJsonFile(FILE_DOT_TOKENS_CACHE, z.array(TokenSchema))
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const dotNetworkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const dotNetworks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const rpcsHealth = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET)

  const metadataExtractsById = keyBy(metadataExtracts, 'id')
  const specsById = keyBy(dotNetworkSpecs, 'id')

  const networksToUpdate = dotNetworks
    .map((network) => ({
      network,
      miniMetadatas: metadataExtractsById[network.id]?.miniMetadatas,
      rpcs: network.rpcs?.filter((rpc) => rpcsHealth[rpc] === 'OK'),
      specs: specsById[network.id] as DotNetworkSpecs | undefined,
    }))
    .filter((args): args is FetchDotNetworkTokensArgs => {
      const { rpcs, specs, miniMetadatas } = args
      if (!rpcs || !rpcs.length) {
        console.warn('No rpcs available for network %s, skipping fetchDotTokens', args.network.id)
        return false // no rpcs available for this network - cant be updated
      }
      if (!specs) {
        console.warn('No specs available for network %s, skipping fetchDotTokens', args.network.id)
        return false // no specs available for this network - cant be updated
      }
      if (!miniMetadatas) {
        console.warn('No miniMetadatas available for network %s, skipping fetchDotTokens', args.network.id)
        return false // no specs available for this network - cant be updated
      }
      return true // all gud!
    })

  const result = await PromisePool.withConcurrency(4)
    .for(networksToUpdate)
    .process((network) =>
      withTimeout(
        () => fetchDotNetworkTokens(network),
        30_000,
        'Failed to fetch metadata extract for ' + network.network.id,
      ),
    )

  for (const error of result.errors) console.warn(error.message)
  console.log(
    'fetchDotTokens processed %s networks (success:%s errors:%s)',
    networksToUpdate.length,
    result.results.length,
    result.errors.length,
  )

  // TODO load previous cache and merge with new data

  const newTokenList = result.results.reduce((allTokens, networkTokens) => Object.assign(allTokens, networkTokens), {})

  const data = values(newTokenList).sort((a, b) => a.id.localeCompare(b.id))

  await writeJsonFile(FILE_DOT_TOKENS_CACHE, values(data), {
    format: true,
    // schema: DotNetworkMetadataExtractsFileSchema,
  })

  // return data // Replace with actual validation when schema is available
  await writeJsonFile(FILE_DOT_TOKENS_CACHE, values(data), {
    format: true,
    schema: z.array(TokenSchema),
  })
}

type FetchDotNetworkTokensArgs = {
  network: DotNetworkConfig
  rpcs: string[]
  specs: DotNetworkSpecs
  miniMetadatas: DotNetworkMetadataExtract['miniMetadatas']
}

const fetchDotNetworkTokens = async ({
  network,
  specs,
  rpcs,
  miniMetadatas,
}: FetchDotNetworkTokensArgs): Promise<Record<string, DotToken>> => {
  console.log('Fetching tokens for network %s', network.id)

  const provider = getRpcProvider(rpcs)

  try {
    await provider.isReady

    const { chainConnectors, stubChaindataProvider } = getHackedBalanceModuleDeps(network, provider)

    // const miniMetadatas: Record<string, MiniMetadata> = {}
    const tokens: Record<string, any> = {}

    for (const mod of defaultBalanceModules
      .map((mod) => mod({ chainConnectors, chaindataProvider: stubChaindataProvider as unknown as ChaindataProvider }))
      .filter((mod) => mod.type.startsWith('substrate-'))) {
      const source = mod.type as keyof DotNetworkConfig['balancesConfig']
      const chainId = network.id

      const { specVersion } = specs.runtimeVersion

      const miniMetadataId = deriveMiniMetadataId({
        source,
        chainId,
        specVersion,
        libVersion: BALANCES_LIB_VERSION,
      })

      const miniMetadata = miniMetadatas[miniMetadataId]

      if (!miniMetadata) {
        console.warn('MiniMetadata not found for network %s and module %s, skipping fetchDotTokens', network.id, source)
        continue
      }

      const chainMeta = {
        miniMetadata: miniMetadata.data,
        extra: miniMetadata.extra,
      }

      const moduleTokens = await mod.fetchSubstrateChainTokens(
        network.id,
        chainMeta as never, // wtf typescript ??
        network.balancesConfig?.[source],
        network.tokens?.[source],
      )
      Object.assign(tokens, moduleTokens)
    }

    return tokens
  } catch (cause) {
    // decAnyMetadata throws null if metadata version is unsupported
    if (cause === null) console.warn('Unsupported metadata version on network', network.id)
    throw new Error(`Failed to fetch metadata extract for ${network.id}: ${cause}`, { cause })
  } finally {
    await provider.disconnect()
  }
}
