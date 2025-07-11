import { PromisePool } from '@supercharge/promise-pool'
import { BALANCE_MODULES, deriveMiniMetadataId } from '@talismn/balances'
import { DotToken, NetworkId, Token } from '@talismn/chaindata-provider'
import groupBy from 'lodash/groupBy'
import keyBy from 'lodash/keyBy'
import toPairs from 'lodash/toPairs'
import values from 'lodash/values'

import { CoingeckoCoin, fetchCoins } from '../../shared/coingecko'
import {
  FILE_DOT_TOKENS_PREBUILD,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
} from '../../shared/constants'
import { getChainConnectorStub } from '../../shared/getChainConnector'
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
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { withTimeout } from '../../shared/withTimeout'
import { writeJsonFile } from '../../shared/writeFile'

export const fetchDotTokens = async () => {
  const prevDotTokens = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const dotNetworkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const dotNetworks = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const coins = await fetchCoins()

  const metadataExtractsById = keyBy(metadataExtracts, 'id')
  const specsById = keyBy(dotNetworkSpecs, 'id')
  const tokensByNetwork = groupBy(prevDotTokens, (t) => t.networkId)

  const networksToUpdate = dotNetworks
    .map((network) => ({
      network,
      miniMetadatas: metadataExtractsById[network.id]?.miniMetadatas,
      rpcs: getRpcsByStatus(network.id, 'polkadot', 'OK'),
      specs: specsById[network.id] as DotNetworkSpecs | undefined,
      tokens: tokensByNetwork[network.id] ?? [],
      coins,
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

  // override tokens only for networks that succeeded
  for (const [networkId, tokens] of result.results) tokensByNetwork[networkId] = tokens

  const data = values(tokensByNetwork)
    .flat()
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeJsonFile(FILE_DOT_TOKENS_PREBUILD, data, {
    schema: DotTokensPreBuildFileSchema,
  })
}

type FetchDotNetworkTokensArgs = {
  network: DotNetworkConfig
  rpcs: string[]
  specs: DotNetworkSpecs
  miniMetadatas: DotNetworkMetadataExtract['miniMetadatas']
  tokens: DotToken[]
  coins: CoingeckoCoin[]
}

const fetchDotNetworkTokens = async ({
  network,
  specs,
  rpcs,
  miniMetadatas,
  tokens: prevTokens,
  coins,
}: FetchDotNetworkTokensArgs): Promise<[NetworkId, Token[]]> => {
  console.log('Fetching tokens for network %s', network.id)

  const provider = getRpcProvider(rpcs)

  try {
    await provider.isReady

    const connector = getChainConnectorStub(provider)

    const newTokens: Record<string, any> = {}

    for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'polkadot')) {
      try {
        const source = mod.type as keyof DotNetworkConfig['balancesConfig']
        const chainId = network.id

        const { specVersion } = specs.runtimeVersion

        const miniMetadataId = deriveMiniMetadataId({
          source,
          chainId,
          specVersion,
        })

        const miniMetadata = miniMetadatas[miniMetadataId]

        if (!miniMetadata)
          throw new Error(`Up to date MiniMetadata not found for network ${chainId} and module ${source}`)

        const tokens = (
          mod.type === 'substrate-native' ? [network.nativeCurrency ?? {}] : (network.tokens?.[source] ?? [])
        ) as any[]

        if (network.id === 'hydradx' && mod.type === 'substrate-hydration') {
          const hydrationCoingeckoIds = getHydrationCoingeckoIdsByAssetId(coins)
          for (const [strOnChainId, coingeckoId] of toPairs(hydrationCoingeckoIds)) {
            const onChainId = Number(strOnChainId)
            const existingToken = tokens.find((t) => t.onChainId === onChainId)
            if (existingToken) {
              // if token already exists, just update its coingeckoId
              existingToken.coingeckoId = coingeckoId
            } else {
              // otherwise create a new token with the coingeckoId
              tokens.push({
                onChainId,
                coingeckoId,
              })
            }
          }
        }

        const moduleTokens: Token[] = await mod.fetchTokens({
          networkId: network.id,
          tokens: (mod.type === 'substrate-native'
            ? [network.nativeCurrency ?? {}]
            : (network.tokens?.[source] ?? [])) as any[],
          miniMetadata,
          connector,
          cache: {},
        })

        Object.assign(
          newTokens,
          keyBy(moduleTokens, (t) => t.id),
        )
      } catch (cause) {
        console.log(
          'Failed to fetch tokens for module %s on network %s: %s',
          mod.type,
          network.id,
          (cause as Error).message,
        )
        // if it fails we want to return the list of previous tokens for that module/network
        Object.assign(
          newTokens,
          keyBy(
            prevTokens.filter((t) => t.type === mod.type && t.networkId === network.id),
            (t) => t.id,
          ),
        )
      }
    }

    return [network.id, Object.values(newTokens)]
  } catch (cause) {
    // decAnyMetadata throws null if metadata version is unsupported
    if (cause === null) console.warn('Unsupported metadata version on network', network.id)
    throw new Error(`Failed to fetch dot tokens for ${network.id}: ${cause}`, { cause })
  } finally {
    await provider.disconnect()
  }
}

const getHydrationCoingeckoIdsByAssetId = (coins: CoingeckoCoin[]): Record<string, string> => {
  const prefix = 'asset_registry%2F'

  return coins.reduce((acc, coin) => {
    const hydrationId = coin.platforms?.['hydration']

    if (hydrationId?.startsWith(prefix)) {
      try {
        // check that we get a valid number
        const assetId = Number(hydrationId.substring(prefix.length).trim())
        if (isNaN(assetId)) throw new Error('Invalid assetId')

        return { ...acc, [assetId]: coin.id }
      } catch {}
    }

    return acc
  }, {})
}
