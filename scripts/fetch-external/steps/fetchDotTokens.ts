import { PromisePool } from '@supercharge/promise-pool'
import { defaultBalanceModules, deriveMiniMetadataId, MINIMETADATA_VERSION } from '@talismn/balances'
import { ChaindataProvider, DotToken, NetworkId, Token } from '@talismn/chaindata-provider'
import groupBy from 'lodash/groupBy'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import {
  FILE_DOT_TOKENS_CACHE,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
} from '../../shared/constants'
import { getHackedBalanceModuleDeps } from '../../shared/getHackedBalanceModuleDeps'
import { getRpcProvider } from '../../shared/getRpcProvider'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
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
import { DotTokensCacheFileSchema } from '../../shared/schemas/DotTokensCache'
import { withTimeout } from '../../shared/withTimeout'
import { writeJsonFile } from '../../shared/writeFile'

export const fetchDotTokens = async () => {
  const prevDotTokens = parseJsonFile(FILE_DOT_TOKENS_CACHE, DotTokensCacheFileSchema)
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const dotNetworkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const dotNetworks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)

  const metadataExtractsById = keyBy(metadataExtracts, 'id')
  const specsById = keyBy(dotNetworkSpecs, 'id')

  const networksToUpdate = dotNetworks
    .map((network) => ({
      network,
      miniMetadatas: metadataExtractsById[network.id]?.miniMetadatas,
      rpcs: getRpcsByStatus(network.id, 'polkadot', 'OK'),
      specs: specsById[network.id] as DotNetworkSpecs | undefined,
    }))
    .filter((args): args is FetchDotNetworkTokensArgs => {
      const { rpcs, specs, miniMetadatas } = args
      if (!rpcs || !rpcs.length) {
        // console.warn('No rpcs available for network %s, skipping fetchDotTokens', args.network.id)
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

  const tokensByNetwork = groupBy(prevDotTokens, (t) => t.networkId)

  // override tokens only for networks that succeeded
  for (const [networkId, tokens] of result.results) tokensByNetwork[networkId] = tokens

  const data = values(tokensByNetwork)
    .flat()
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeJsonFile(FILE_DOT_TOKENS_CACHE, data, {
    schema: DotTokensCacheFileSchema,
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
}: FetchDotNetworkTokensArgs): Promise<[NetworkId, Token[]]> => {
  console.log('Fetching tokens for network %s', network.id)

  const provider = getRpcProvider(rpcs)

  try {
    await provider.isReady

    const { chainConnectors, stubChaindataProvider } = getHackedBalanceModuleDeps(network, provider)

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
        version: MINIMETADATA_VERSION,
      })

      const miniMetadata = miniMetadatas[miniMetadataId]

      if (!miniMetadata)
        throw new Error(`Up to date MiniMetadata not found for network ${chainId} and module ${source}`)

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

    return [network.id, Object.values(tokens)]
  } catch (cause) {
    // decAnyMetadata throws null if metadata version is unsupported
    if (cause === null) console.warn('Unsupported metadata version on network', network.id)
    throw new Error(`Failed to fetch dot tokens for ${network.id}: ${cause}`, { cause })
  } finally {
    await provider.disconnect()
  }
}
