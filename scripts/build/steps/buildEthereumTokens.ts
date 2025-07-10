import type { Dictionary } from 'lodash'
import { evm } from '@polkadot/types/interfaces/definitions'
import { EvmErc20TokenConfig, EvmUniswapV2TokenConfig } from '@talismn/balances'
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

import { checkDuplicates } from '../../shared/checkDuplicates'
import {
  FILE_ETH_TOKENS_PREBUILD,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_TOKENS_ETHEREUM,
} from '../../shared/constants'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { EthNetworkConfig, EthNetworksConfigFileSchema, KnownEthNetworkConfig } from '../../shared/schemas'
import { EthTokensPreBuildFileSchema } from '../../shared/schemas/EthTokensPreBuild'
import { validateDebug } from '../../shared/validate'
import { writeJsonFile } from '../../shared/writeFile'

export const buildEthereumTokens = async () => {
  const ethNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_ETHEREUM, z.array(EthNetworkSchema))
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const ethTokensCache = parseJsonFile<Token[]>(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)

  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))
  const dicTokenCache = keyBy(ethTokensCache, (c) => c.id)

  const ethTokens: Token[] = ethNetworks
    .flatMap((network) => {
      const config = ethNetworkConfigById[network.id]
      const knownEvmNetwork = knownEthNetworkById[network.id]

      return getNetworkTokens(network, config, knownEvmNetwork, dicTokenCache)
    })
    .map((token) => ({
      ...token,
      // fix logo
      logo: getTokenLogoUrl(token.logo, token.coingeckoId, token.symbol),
    }))
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  checkDuplicates(ethTokens)

  await writeJsonFile(FILE_OUTPUT_TOKENS_ETHEREUM, ethTokens, {
    schema: z.array(TokenSchema),
  })
}

const getNetworkTokens = (
  network: EthNetwork,
  networkConfig: EthNetworkConfig | undefined,
  knownEthNetwork: KnownEthNetworkConfig | undefined,
  dicTokenCache: Dictionary<Token>,
): Token[] => {
  const knownErc20s = (knownEthNetwork?.tokens?.['evm-erc20'] ?? []) as EvmErc20TokenConfig[]
  const knownUniswapV2 = (knownEthNetwork?.tokens?.['evm-uniswapv2'] ?? []) as EvmUniswapV2TokenConfig[]
  const configErc20s = (networkConfig?.tokens?.['evm-erc20'] ?? []) as EvmErc20TokenConfig[]
  const configUniswapV2 = (networkConfig?.tokens?.['evm-uniswapv2'] ?? []) as EvmUniswapV2TokenConfig[]

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

  const networkId = String(network.id) as NetworkId
  const nativeToken = getNativeToken(network)

  const uniswapV2s = uniswapV2Configs.map((uniswapV2Config): EthToken | null => {
    const pool = dicTokenCache[evmUniswapV2TokenId(networkId, uniswapV2Config.contractAddress)] as EvmUniswapV2Token
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
    const erc20 = dicTokenCache[evmErc20TokenId(networkId, erc20Config.contractAddress)] as EvmErc20Token | undefined

    const symbol = erc20?.symbol ?? (erc20Config.symbol as string)
    const token: EvmErc20Token = {
      type: 'evm-erc20',
      id: evmErc20TokenId(networkId, erc20Config.contractAddress as `0x${string}`),
      platform: 'ethereum',
      networkId,
      contractAddress: erc20Config.contractAddress as `0x${string}`,
      symbol,
      name: erc20Config.name ?? erc20?.name ?? `${symbol} ERC20 Token`,
      decimals: erc20Config.decimals ?? erc20?.decimals!,
      logo: getTokenLogoUrl(erc20Config.logo, erc20Config.coingeckoId, symbol),
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
    isDefault: true,
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
