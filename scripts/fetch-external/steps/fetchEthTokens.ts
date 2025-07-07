import { PromisePool } from '@supercharge/promise-pool'
import { BALANCE_MODULES, defaultBalanceModules, deriveMiniMetadataId, MINIMETADATA_VERSION } from '@talismn/balances'
import {
  ChaindataProvider,
  DotToken,
  EthToken,
  EvmErc20Token,
  EvmUniswapV2Token,
  NetworkId,
  Token,
  TokenId,
  TokenSchema,
  TokenType,
} from '@talismn/chaindata-provider'
import assign from 'lodash/assign'
import groupBy from 'lodash/groupBy'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import {
  FILE_DOT_TOKENS_PREBUILD,
  FILE_ETH_TOKENS_PREBUILD,
  FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_MODULE_CACHE_ERC20,
  FILE_MODULE_CACHE_UNISWAPV2,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
} from '../../shared/constants'
import { getChainConnectorStub } from '../../shared/getChainConnector'
import { getChainConnectorEvm } from '../../shared/getChainConnectorEvm'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { getHackedBalanceModuleDeps } from '../../shared/getHackedBalanceModuleDeps'
import { getRpcProvider } from '../../shared/getRpcProvider'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import {
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  DotNetworkSpecs,
  DotNetworkSpecsFileSchema,
  EthNetworkConfig,
  EthNetworksConfigFileSchema,
} from '../../shared/schemas'
import {
  DotNetworkMetadataExtract,
  DotNetworkMetadataExtractsFileSchema,
} from '../../shared/schemas/DotNetworkMetadataExtract'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { EthTokensPreBuildFileSchema } from '../../shared/schemas/EthTokensPreBuild'
import { withTimeout } from '../../shared/withTimeout'
import { writeJsonFile } from '../../shared/writeFile'

type CacheEntry = { id: string } & Record<string, unknown>
type TokenCache = Partial<Record<TokenType, Record<TokenId, CacheEntry>>>

export const fetchEthTokens = async () => {
  const prevEthTokens = parseJsonFile(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)

  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const moduleCacheErc20 = parseJsonFile<CacheEntry[]>(FILE_MODULE_CACHE_ERC20)
  const moduleCacheUniswapV2 = parseJsonFile<CacheEntry[]>(FILE_MODULE_CACHE_UNISWAPV2)

  console.log('erc20cache:%s uniswapv2cache:%s', moduleCacheErc20.length, moduleCacheUniswapV2.length)

  const caches: TokenCache = {
    'evm-erc20': keyBy(moduleCacheErc20, (t) => t.id),
    'evm-uniswapv2': keyBy(moduleCacheUniswapV2, (t) => t.id),
  }

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))
  const allEthNetworkIds = [
    ...new Set([...Object.keys(ethNetworkConfigById), ...Object.keys(knownEthNetworkById)]),
  ].sort((a, b) => Number(a) - Number(b))

  const tokensByNetwork = groupBy(prevEthTokens, (t) => t.networkId)

  const networksToUpdate = allEthNetworkIds
    .map(
      (networkId): FetchEthNetworkTokensArgs => ({
        networkId,
        configNetwork: ethNetworkConfigById[networkId] as EthNetworkConfig,
        knownNetwork: knownEthNetworkById[networkId] as EthNetworkConfig,
        rpcs: getRpcsByStatus(networkId, 'ethereum', 'OK').filter(
          (r) => !r.includes('thirdweb') && !r.includes('ankr'),
        ),
        prevTokens: (tokensByNetwork[networkId] as EthToken[]) ?? [],
        caches,
      }),
    )
    .filter((args) => {
      const { rpcs } = args
      if (!rpcs || !rpcs.length) {
        // console.warn('No rpcs available for network %s, skipping fetchDotTokens', args.network.id)
        return false // no rpcs available for this network - cant be updated
      }
      return true // all gud!
    })

  const result = await PromisePool.withConcurrency(4)
    .for(networksToUpdate)
    .process(
      (
        network, // fetchEthNetworkTokens(network),
      ) =>
        withTimeout(
          () => fetchEthNetworkTokens(network),
          500_000,
          'Failed to fetch metadata extract for ' + network.networkId,
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

  await writeJsonFile(FILE_ETH_TOKENS_PREBUILD, data, {
    schema: EthTokensPreBuildFileSchema,
  })

  await writeJsonFile(
    FILE_MODULE_CACHE_ERC20,
    values(caches['evm-erc20']).sort((a, b) => a.id.localeCompare(b.id)),
  )
  await writeJsonFile(
    FILE_MODULE_CACHE_UNISWAPV2,
    values(caches['evm-uniswapv2']).sort((a, b) => a.id.localeCompare(b.id)),
  )
}

type FetchEthNetworkTokensArgs = {
  networkId: NetworkId
  configNetwork?: EthNetworkConfig
  knownNetwork?: EthNetworkConfig
  rpcs: string[]
  prevTokens: EthToken[]
  caches: TokenCache
}

const fetchEthNetworkTokens = async ({
  networkId,
  configNetwork,
  knownNetwork,
  rpcs,
  prevTokens,
  caches,
}: FetchEthNetworkTokensArgs): Promise<[NetworkId, Token[]]> => {
  // console.log('Fetching tokens for network %s', networkId)

  try {
    const connector = getChainConnectorEvm(assign({}, knownNetwork, configNetwork, { rpcs }))

    const newTokens: Record<string, any> = {}

    for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'ethereum')) {
      try {
        const source = mod.type as keyof DotNetworkConfig['balancesConfig']

        // const start = performance.now()
        const moduleTokens: Token[] = await mod.fetchTokens({
          networkId,
          tokens: (mod.type === 'evm-native'
            ? [assign({}, configNetwork?.nativeCurrency, knownNetwork?.nativeCurrency)]
            : [...(configNetwork?.tokens?.[source] ?? []), ...(knownNetwork?.tokens?.[source] ?? [])]) as any[],
          connector,
          cache: caches[mod.type] ?? {},
        })

        const validTokens = moduleTokens.filter((t) => TokenSchema.safeParse(t).success)

        // console.log(
        //   'Network %s module %s fetched %s tokens (%s total): %sms',
        //   networkId,
        //   mod.type,
        //   validTokens.length,
        //   moduleTokens.length,
        //   (performance.now() - start).toFixed(2),
        // )

        Object.assign(
          newTokens,
          keyBy(validTokens, (t) => t.id),
        )
      } catch (cause) {
        console.log(
          'Failed to fetch tokens for module %s on network %s: %s',
          mod.type,
          networkId,
          (cause as Error).message,
        )
        // if it fails we want to return the list of previous tokens for that module/network
        Object.assign(
          newTokens,
          keyBy(
            prevTokens.filter((t) => t.type === mod.type && t.networkId === networkId),
            (t) => t.id,
          ),
        )
      }
    }

    return [networkId, Object.values(newTokens)]
  } catch (cause) {
    throw new Error(`Failed to fetch eth tokens for ${networkId}: ${cause}`, { cause })
  }
}
