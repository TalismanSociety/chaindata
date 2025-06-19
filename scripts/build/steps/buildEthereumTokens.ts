import {
  EthNetwork,
  EthNetworkSchema,
  EthToken,
  EvmErc20Token,
  evmErc20TokenId,
  EvmErc20TokenSchema,
  EvmNativeToken,
  evmNativeTokenId,
  EvmNativeTokenSchema,
  EvmUniswapV2Token,
  evmUniswapV2TokenId,
  EvmUniswapV2TokenSchema,
  NetworkId,
  Token,
  TokenSchema,
} from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import keys from 'lodash/keys'
import uniq from 'lodash/uniq'
import { z } from 'zod/v4'

import { getConsolidatedKnownEthNetworks } from '../../fetch-external/getConsolidatedEthNetworksOverrides'
import {
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_TOKENS_ETHEREUM,
} from '../../shared/constants'
import { EthNetworkConfig, EthNetworksConfigFileSchema, KnownEthNetworkConfig } from '../../shared/schemas'
import { Uniswapv2TokenCache } from '../../shared/types'
import { getTokenLogoUrl, parseJsonFile, parseYamlFile, validateDebug, writeJsonFile } from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

type EvmErc20TokenBalanceConfig = {
  symbol: string
  name: string
  decimals: number
  contractAddress: `0x${string}`
  mirrorOf?: string
  coingeckoId?: string
  logo?: string
  noDiscovery?: boolean
  isDefault?: boolean
}

export const buildEthereumTokens = async () => {
  const ethNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_ETHEREUM, z.array(EthNetworkSchema))
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const uniswapV2Cache = parseJsonFile<Uniswapv2TokenCache[]>(FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE)

  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))

  const ethTokens: Token[] = ethNetworks
    .flatMap((network) => {
      const config = ethNetworkConfigById[network.id]
      const knownEvmNetwork = knownEthNetworkById[network.id]

      return getNetworkTokens(network, config, knownEvmNetwork, uniswapV2Cache)
    })
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  checkDuplicates(ethTokens)

  await writeJsonFile(FILE_OUTPUT_TOKENS_ETHEREUM, ethTokens, {
    format: true,
    schema: z.array(TokenSchema),
  })
}

const getNetworkTokens = (
  network: EthNetwork,
  networkConfig: EthNetworkConfig | undefined,
  knownEthNetwork: KnownEthNetworkConfig | undefined,
  univ2Cache: Uniswapv2TokenCache[],
): Token[] => {
  const knownErc20s = (knownEthNetwork?.balancesConfig?.['evm-erc20']?.tokens ?? []) as EvmErc20TokenBalanceConfig[]
  const knownUniswapV2 = (knownEthNetwork?.balancesConfig?.['evm-uniswapv2']?.pools ??
    []) as EvmErc20TokenBalanceConfig[]
  const configErc20s = (networkConfig?.balancesConfig?.['evm-erc20']?.tokens ?? []) as EvmErc20TokenBalanceConfig[]
  const configUniswapV2 = (networkConfig?.balancesConfig?.['evm-uniswapv2']?.pools ??
    []) as EvmErc20TokenBalanceConfig[]

  const dicKnownErc20s = keyBy(knownErc20s, (c) => c.contractAddress.toLowerCase())
  const dicConfigErc20s = keyBy(configErc20s, (c) => c.contractAddress.toLowerCase())
  const erc20Configs = uniq(keys(dicKnownErc20s).concat(...keys(dicConfigErc20s))).map((address) =>
    Object.assign({}, dicKnownErc20s[address], dicConfigErc20s[address]),
  )

  const dicKnownUniswapV2 = keyBy(knownUniswapV2, (c) => c.contractAddress.toLowerCase())
  const dicConfigUniswapV2 = keyBy(configUniswapV2, (c) => c.contractAddress.toLowerCase())
  const uniswapV2Configs = uniq(keys(dicKnownUniswapV2).concat(...keys(dicConfigUniswapV2))).map((address) =>
    Object.assign({}, dicKnownUniswapV2[address], dicConfigUniswapV2[address]),
  )

  // const nativeCurrency = Object.assign(
  //   {},
  //   knownEthNetwork?.nativeCurrency,
  //   networkConfig?.nativeCurrency,
  // ) as EthNetwork['nativeCurrency']

  // if (networkId === '9')
  //   console.log({ nativeCurrency, known: knownEthNetwork?.nativeCurrency, config: networkConfig?.nativeCurrency })
  const networkId = String(network.id) as NetworkId
  const nativeToken = getNativeToken(network)

  const uniswapV2s = uniswapV2Configs.map((uniswapV2Config): EthToken | null => {
    const pool = univ2Cache.find(
      (pool) =>
        pool.chainId === networkId &&
        pool.contractAddress.toLowerCase() === uniswapV2Config.contractAddress.toLowerCase(),
    )
    if (!pool) {
      console.log('UniswapV2 pool not found in cache for', networkId, uniswapV2Config.contractAddress)
      return null
    }

    const {
      symbol0,
      symbol1,
      contractAddress,
      decimals,
      decimals0,
      decimals1,
      tokenAddress0,
      tokenAddress1,
      coingeckoId0,
      coingeckoId1,
    } = pool

    const token: EvmUniswapV2Token = {
      type: 'evm-uniswapv2',
      id: evmUniswapV2TokenId(networkId, uniswapV2Config.contractAddress),
      platform: 'ethereum',
      networkId,
      symbol0,
      symbol1,
      symbol: `${symbol0}/${symbol1}`,
      name: `${symbol0}/${symbol1} Uniswap V2 Pool`,
      contractAddress: contractAddress as `0x${string}`,
      decimals,
      decimals0,
      decimals1,
      tokenAddress0: tokenAddress0 as `0x${string}`,
      tokenAddress1: tokenAddress1 as `0x${string}`,
      coingeckoId0,
      coingeckoId1,
    }

    // filter out invalid tokens (empty symbol, missing decimals, etc.)
    const parsed = EvmUniswapV2TokenSchema.safeParse(token)
    if (!parsed.success) {
      console.warn('Invalid Uniswap V2 token:', parsed.error, token)
      return null
    }
    return parsed.data
  })

  const erc20s = erc20Configs.map((erc20Config): EthToken | null => {
    const token: EvmErc20Token = {
      type: 'evm-erc20',
      id: evmErc20TokenId(networkId, erc20Config.contractAddress as `0x${string}`),
      platform: 'ethereum',
      networkId,
      contractAddress: erc20Config.contractAddress as `0x${string}`,
      symbol: erc20Config.symbol,
      name: erc20Config.name,
      decimals: erc20Config.decimals,
      logo: getTokenLogoUrl(erc20Config.logo, erc20Config.coingeckoId, erc20Config.symbol), // getAssetUrlFromPath(erc20Config.logo) ?? getAssetPathFromCoingeckoTokenId(erc20Config.coingeckoId),
      mirrorOf: erc20Config.mirrorOf,
      coingeckoId: erc20Config.coingeckoId,
      noDiscovery: erc20Config.noDiscovery,
      isDefault: erc20Config.isDefault,
    }

    // filter out invalid tokens (empty symbol, missing decimals, etc.)
    const parsed = EvmErc20TokenSchema.safeParse(token)
    return parsed.success ? parsed.data : null
  })

  return [nativeToken, ...erc20s, ...uniswapV2s].filter((t): t is EthToken => !!t)
}

const getNativeToken = (network: EthNetwork): EvmNativeToken => {
  const token: EvmNativeToken = {
    type: 'evm-native',
    id: evmNativeTokenId(network.id),
    platform: 'ethereum',
    networkId: network.id,
    symbol: network.nativeCurrency.symbol,
    name: network.nativeCurrency.name,
    decimals: network.nativeCurrency.decimals ?? 18,
    logo: getTokenLogoUrl(
      network.nativeCurrency.logo,
      network.nativeCurrency.coingeckoId,
      network.nativeCurrency.symbol,
    ),
    coingeckoId: network.nativeCurrency.coingeckoId,
    mirrorOf: network.nativeCurrency.mirrorOf,
  }

  try {
    return validateDebug(token, EvmNativeTokenSchema, 'native token')
  } catch (err) {
    console.log('PROBLEM', token)
    throw err
  }
}
