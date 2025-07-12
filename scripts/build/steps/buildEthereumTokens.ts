import { EvmErc20TokenConfig, EvmUniswapV2TokenConfig } from '@talismn/balances'
import { EthNetwork, EthNetworkSchema, isTokenEth, NetworkId, Token, TokenSchema } from '@talismn/chaindata-provider'
import assign from 'lodash/assign'
import keyBy from 'lodash/keyBy'
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
import { writeJsonFile } from '../../shared/writeFile'

export const buildEthereumTokens = async () => {
  const ethNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_ETHEREUM, z.array(EthNetworkSchema))
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const ethTokensCache = parseJsonFile<Token[]>(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)

  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))

  const ethTokens: Token[] = ethNetworks
    .flatMap((network) => {
      const config = ethNetworkConfigById[network.id]
      const knownEvmNetwork = knownEthNetworkById[network.id]

      return getNetworkTokens(network, config, knownEvmNetwork, ethTokensCache)
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
  tokenCache: Token[],
): Token[] => {
  const knownErc20s = (knownEthNetwork?.tokens?.['evm-erc20'] ?? []) as EvmErc20TokenConfig[]
  const knownUniswapV2 = (knownEthNetwork?.tokens?.['evm-uniswapv2'] ?? []) as EvmUniswapV2TokenConfig[]
  const configErc20s = (networkConfig?.tokens?.['evm-erc20'] ?? []) as EvmErc20TokenConfig[]
  const configUniswapV2 = (networkConfig?.tokens?.['evm-uniswapv2'] ?? []) as EvmUniswapV2TokenConfig[]

  const dicKnownErc20s = keyBy(knownErc20s, (c) => c.contractAddress.toLowerCase())
  const dicConfigErc20s = keyBy(configErc20s, (c) => c.contractAddress.toLowerCase())

  const dicKnownUniswapV2 = keyBy(knownUniswapV2, (c) => c.contractAddress.toLowerCase())
  const dicConfigUniswapV2 = keyBy(configUniswapV2, (c) => c.contractAddress.toLowerCase())

  const networkId = String(network.id) as NetworkId

  return tokenCache
    .filter(isTokenEth)
    .filter((t) => t.networkId === networkId)
    .map((token) => {
      switch (token.type) {
        case 'evm-native':
          return assign({}, token, knownEthNetwork?.nativeCurrency, networkConfig?.nativeCurrency)
        case 'evm-erc20':
          return assign(
            {},
            token,
            dicKnownErc20s[token.contractAddress.toLowerCase()],
            dicConfigErc20s[token.contractAddress.toLowerCase()],
          )
        case 'evm-uniswapv2':
          return assign(
            {},
            token,
            dicKnownUniswapV2[token.contractAddress.toLowerCase()],
            dicConfigUniswapV2[token.contractAddress.toLowerCase()],
          )
      }
    })
}
