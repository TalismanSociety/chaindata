import { readFile, writeFile } from 'node:fs/promises'

import mergeWith from 'lodash/mergeWith'
import prettier from 'prettier'
import { BaseError, TimeoutError } from 'viem'

import {
  FILE_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS_OVERRIDES,
  FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE,
  PRETTIER_CONFIG,
} from '../../shared/constants'
import { ConfigEvmNetwork, Uniswapv2TokenCache } from '../../shared/types'
import { networkMergeCustomizer } from '../../shared/util'
import { erc20Abi } from '../erc20Abi'
import { getEvmNetworkClient } from '../getEvmNetworkClient'
import { uniswapV2PairAbi } from '../uniswapV2PairAbi'

export const fetchUniswapv2TokenExtras = async () => {
  const evmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_EVM_NETWORKS, 'utf-8'))
  const tokensCache: Uniswapv2TokenCache[] = JSON.parse(await readFile(FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE, 'utf-8'))

  const _knownEvmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8'))
  const knownEvmNetworksOverrides: ConfigEvmNetwork[] = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_OVERRIDES, 'utf-8'),
  )
  const knownEvmNetworks = _knownEvmNetworks.map((knownEvmNetwork) => {
    const overrides = knownEvmNetworksOverrides.find((ov) => ov.id === knownEvmNetwork.id)
    return overrides ? mergeWith(knownEvmNetwork, overrides, networkMergeCustomizer) : knownEvmNetwork
  })

  const networksById = Object.fromEntries(evmNetworks.map((n) => [n.id, n]))
  const knownNetworksById = Object.fromEntries(knownEvmNetworks.map((n) => [n.id, n]))

  // need to dedupe tokens that are registered in both knownEvmTokens and evmTokens
  const tokenDefs = new Set<string>()
  const erc20CoingeckoIdsByNetwork = new Map<string, Map<string, string>>()
  for (const network of evmNetworks.concat(knownEvmNetworks)) {
    ;(network.balancesConfig?.['evm-uniswapv2']?.pools ?? []).forEach((token) =>
      tokenDefs.add(`${network.id}||${token.poolAddress?.toLowerCase?.()}`),
    )

    if (!erc20CoingeckoIdsByNetwork.has(network.id)) erc20CoingeckoIdsByNetwork.set(network.id, new Map())
    const erc20CoingeckoIds = erc20CoingeckoIdsByNetwork.get(network.id)!
    ;(network.balancesConfig?.['evm-erc20']?.tokens ?? []).forEach((token) => {
      if (!token.contractAddress) return
      if (!token.coingeckoId) return
      if (erc20CoingeckoIds.has(token.contractAddress.toLowerCase())) return
      erc20CoingeckoIds.set(token.contractAddress.toLowerCase(), token.coingeckoId)
    })
  }

  await Promise.all(
    Array.from(tokenDefs)
      .map((td) => {
        const [chainId, poolAddress] = td.split('||')
        const network = networksById[chainId] ?? knownNetworksById[chainId]
        const erc20CoingeckoIds = erc20CoingeckoIdsByNetwork.get(chainId) ?? new Map<string, string>()
        return [network, erc20CoingeckoIds, poolAddress] as const
      })
      .map(([network, erc20CoingeckoIds, poolAddress]) =>
        updateTokenCache(tokensCache, network, erc20CoingeckoIds, poolAddress),
      ),
  )

  tokensCache.sort((a, b) => {
    if (a.chainId !== b.chainId) return parseInt(a.chainId) - parseInt(b.chainId)
    if (a.symbol0 !== b.symbol0) return a.symbol0.localeCompare(b.symbol0)
    if (a.symbol1 !== b.symbol1) return a.symbol1.localeCompare(b.symbol1)
    return a.poolAddress.localeCompare(b.poolAddress)
  })

  await writeFile(
    FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE,
    await prettier.format(JSON.stringify(tokensCache, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
}

const isCached = (tokenCache: Uniswapv2TokenCache[], chainId: string, poolAddress: string) =>
  tokenCache.some((t) => t.chainId === chainId && t.poolAddress.toLowerCase() === poolAddress.toLowerCase())

const updateTokenCache = async (
  tokenCache: Uniswapv2TokenCache[],
  evmNetwork: ConfigEvmNetwork,
  erc20CoingeckoIds: Map<string, string>,
  poolAddress: string,
) => {
  // reject invalid addresses
  if (!poolAddress.match(/0x[0-9a-fA-F]{40}/)?.[0]) return

  // short-circuit if already cached
  if (isCached(tokenCache, evmNetwork.id, poolAddress)) return

  try {
    const client = getEvmNetworkClient(evmNetwork)

    const poolContract = { abi: uniswapV2PairAbi, address: poolAddress as `0x${string}` }

    const [
      // Always `UNI-V2` for uniswap v2 contracts
      // { result: symbol },
      { result: decimals },
      { result: tokenAddress0 },
      { result: tokenAddress1 },
    ] = await client.multicall({
      contracts: [
        // { ...poolContract, functionName: "symbol" },
        { ...poolContract, functionName: 'decimals' },
        { ...poolContract, functionName: 'token0' },
        { ...poolContract, functionName: 'token1' },
      ],
    })
    const [{ result: symbol0 }, { result: decimals0 }, { result: symbol1 }, { result: decimals1 }] =
      await client.multicall({
        contracts: [
          { abi: erc20Abi, address: tokenAddress0 as `0x${string}`, functionName: 'symbol' },
          { abi: erc20Abi, address: tokenAddress0 as `0x${string}`, functionName: 'decimals' },
          { abi: erc20Abi, address: tokenAddress1 as `0x${string}`, functionName: 'symbol' },
          { abi: erc20Abi, address: tokenAddress1 as `0x${string}`, functionName: 'decimals' },
        ],
      })

    if (decimals === undefined) return
    if (symbol0 === undefined) return
    if (decimals0 === undefined) return
    if (symbol1 === undefined) return
    if (decimals1 === undefined) return
    if (tokenAddress0 === undefined) return
    if (tokenAddress1 === undefined) return

    const coingeckoId0 = erc20CoingeckoIds.get(tokenAddress0.toLowerCase())
    const coingeckoId1 = erc20CoingeckoIds.get(tokenAddress1.toLowerCase())

    tokenCache.push({
      chainId: evmNetwork.id,
      poolAddress,
      decimals,
      symbol0,
      decimals0,
      symbol1,
      decimals1,
      tokenAddress0,
      tokenAddress1,
      coingeckoId0,
      coingeckoId1,
    })
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn('Timeout on network:%s ', evmNetwork.name, evmNetwork.id)
      return null
    }
    const viemError = err as BaseError
    console.warn('Failed to fetch uniswapv2 token info', {
      network: `${evmNetwork.name} (${evmNetwork.id})`,
      poolAddress,
      err: viemError.shortMessage ?? viemError.message,
    })
  }
}
