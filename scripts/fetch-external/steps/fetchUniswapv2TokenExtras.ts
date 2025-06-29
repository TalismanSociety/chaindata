import { BaseError, erc20Abi, TimeoutError } from 'viem'

import { FILE_INPUT_NETWORKS_ETHEREUM, FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE } from '../../shared/constants'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { EthNetworkConfig, EthNetworksConfigFileSchema } from '../../shared/schemas'
import { Uniswapv2TokenCache } from '../../shared/types'
import { parseJsonFile, parseYamlFile, writeJsonFile } from '../../shared/util'
import { getEvmNetworkClient } from './helpers/getEvmNetworkClient'
import { uniswapV2PairAbi } from './helpers/uniswapV2PairAbi'

export const fetchUniswapv2TokenExtras = async () => {
  const evmNetworks = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const tokensCache = parseJsonFile<Uniswapv2TokenCache[]>(FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const networksById = Object.fromEntries(evmNetworks.map((n) => [n.id, n]))
  const knownNetworksById = Object.fromEntries(knownEthNetworks.map((n) => [n.id, n]))

  // need to dedupe tokens that are registered in both knownEvmTokens and evmTokens
  const tokenDefs = new Set<string>()
  const erc20CoingeckoIdsByNetwork = new Map<string, Map<string, string>>()
  for (const network of evmNetworks.concat(knownEthNetworks)) {
    ;(network.tokens?.['evm-uniswapv2'] ?? []).forEach((token) =>
      tokenDefs.add(`${network.id}||${token.contractAddress?.toLowerCase?.()}`),
    )

    if (!erc20CoingeckoIdsByNetwork.has(network.id)) erc20CoingeckoIdsByNetwork.set(network.id, new Map())
    const erc20CoingeckoIds = erc20CoingeckoIdsByNetwork.get(network.id)!
    ;(network.tokens?.['evm-erc20'] ?? []).forEach((token) => {
      if (!token.contractAddress) return
      if (!token.coingeckoId) return
      if (erc20CoingeckoIds.has(token.contractAddress.toLowerCase())) return
      erc20CoingeckoIds.set(token.contractAddress.toLowerCase(), token.coingeckoId)
    })
  }

  await Promise.all(
    Array.from(tokenDefs)
      .map((td) => {
        const [chainId, contractAddress] = td.split('||')
        const network = networksById[chainId] ?? knownNetworksById[chainId]
        const erc20CoingeckoIds = erc20CoingeckoIdsByNetwork.get(chainId) ?? new Map<string, string>()
        return [network, erc20CoingeckoIds, contractAddress] as const
      })
      .map(([network, erc20CoingeckoIds, contractAddress]) =>
        updateTokenCache(tokensCache, network, erc20CoingeckoIds, contractAddress),
      ),
  )

  tokensCache.sort((a, b) => {
    if (a.chainId !== b.chainId) return parseInt(a.chainId) - parseInt(b.chainId)
    if (a.symbol0 !== b.symbol0) return a.symbol0.localeCompare(b.symbol0)
    if (a.symbol1 !== b.symbol1) return a.symbol1.localeCompare(b.symbol1)
    return a.contractAddress.localeCompare(b.contractAddress)
  })

  await writeJsonFile(FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE, tokensCache)
}

const isCached = (tokenCache: Uniswapv2TokenCache[], chainId: string, contractAddress: string) =>
  tokenCache.some((t) => t.chainId === chainId && t.contractAddress.toLowerCase() === contractAddress.toLowerCase())

const updateTokenCache = async (
  tokenCache: Uniswapv2TokenCache[],
  evmNetwork: EthNetworkConfig,
  erc20CoingeckoIds: Map<string, string>,
  contractAddress: string,
) => {
  // reject invalid addresses
  if (!contractAddress.match(/0x[0-9a-fA-F]{40}/)?.[0]) return

  // short-circuit if already cached
  if (isCached(tokenCache, evmNetwork.id, contractAddress)) return

  try {
    const client = getEvmNetworkClient(evmNetwork)

    const poolContract = { abi: uniswapV2PairAbi, address: contractAddress as `0x${string}` }

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
      contractAddress,
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
      contractAddress,
      err: viemError.shortMessage ?? viemError.message,
    })
  }
}
