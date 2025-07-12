import { PromisePool } from '@supercharge/promise-pool'
import { BALANCE_MODULES } from '@talismn/balances'
import { EthToken, NetworkId, Token, TokenId, TokenSchema, TokenType } from '@talismn/chaindata-provider'
import assign from 'lodash/assign'
import groupBy from 'lodash/groupBy'
import keyBy from 'lodash/keyBy'
import values from 'lodash/values'

import {
  FILE_ETH_TOKENS_PREBUILD,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_MODULE_CACHE_ERC20,
  FILE_MODULE_CACHE_UNISWAPV2,
} from '../../shared/constants'
import { getChainConnectorEvm } from '../../shared/getChainConnectorEvm'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import { DotNetworkConfig, EthNetworkConfig, EthNetworksConfigFileSchema } from '../../shared/schemas'
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

  console.log('Include 5', allEthNetworkIds.includes('5'))

  // Need to process all networks even if they don't have an RPC, or native token wouldnt be generated
  const networksToUpdate = allEthNetworkIds.map(
    (networkId): FetchEthNetworkTokensArgs => ({
      networkId,
      configNetwork: ethNetworkConfigById[networkId] as EthNetworkConfig,
      knownNetwork: knownEthNetworkById[networkId] as EthNetworkConfig,
      rpcs: getRpcsByStatus(networkId, 'ethereum', 'OK'),
      prevTokens: (tokensByNetwork[networkId] as EthToken[]) ?? [],
      caches,
    }),
  )

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
    'fetchEthTokens processed %s networks (success:%s errors:%s)',
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
  try {
    const connector = getChainConnectorEvm(assign({}, knownNetwork, configNetwork, { rpcs }))

    const newTokens: Record<string, any> = {}

    for (const mod of BALANCE_MODULES.filter((mod) => mod.platform === 'ethereum')) {
      try {
        const source = mod.type as keyof DotNetworkConfig['balancesConfig']

        const moduleTokens: Token[] = await mod.fetchTokens({
          networkId,
          tokens: (mod.type === 'evm-native'
            ? [assign({}, configNetwork?.nativeCurrency, knownNetwork?.nativeCurrency)]
            : [...(configNetwork?.tokens?.[source] ?? []), ...(knownNetwork?.tokens?.[source] ?? [])]) as any[],
          connector,
          cache: caches[mod.type] ?? {},
        })

        const validTokens = moduleTokens.filter((t) => TokenSchema.safeParse(t).success)

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

    if (networkId === '5')
      console.log({
        newTokens,
      })

    return [networkId, Object.values(newTokens)]
  } catch (cause) {
    throw new Error(`Failed to fetch eth tokens for ${networkId}: ${cause}`, { cause })
  }
}
