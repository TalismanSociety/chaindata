import {
  EthNetwork,
  EthToken,
  EvmErc20Token,
  evmErc20TokenId,
  EvmErc20TokenSchema,
  EvmNativeToken,
  EvmNativeTokenSchema,
  Token,
  TokenSchema,
} from '@talismn/chaindata'
import keyBy from 'lodash/keyBy'
import keys from 'lodash/keys'
import uniq from 'lodash/uniq'
import { z } from 'zod/v4'

import { getConsolidatedKnownEthNetworks } from '../../fetch-external/getConsolidatedEthNetworksOverrides'
import {
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_OUTPUT_TOKENS_ETHEREUM,
  FILE_OUTPUT_TOKENS_POLKADOT,
} from '../../shared/constants'
import { EthNetworkConfig, EthNetworksConfigFileSchema, KnownEthNetworkConfig } from '../../shared/schemas'
import {
  getAssetPathFromCoingeckoTokenId,
  getAssetUrlFromPath,
  parseYamlFile,
  validate,
  validateDebug,
  writeJsonFile,
} from '../../shared/util'

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

export const buildTokensEthereum = async () => {
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))
  // const viemChainById = keyBy(viemChains, (c) => String(c.id))

  const allEthNetworkIds = [
    ...new Set([...Object.keys(ethNetworkConfigById), ...Object.keys(knownEthNetworkById)]),
  ].sort((a, b) => Number(a) - Number(b))

  // const erc20s = parseJsonFile<Erc20TokenCache[]>(FILE_KNOWN_EVM_ERC20_TOKENS_CACHE)

  const ethTokens: Token[] = allEthNetworkIds
    .flatMap((id) => {
      const config = ethNetworkConfigById[id]
      const knownEvmNetwork = knownEthNetworkById[id]

      return getNetworkTokens(config, knownEvmNetwork)
    })
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  await writeJsonFile(FILE_OUTPUT_TOKENS_ETHEREUM, ethTokens, {
    format: true,
    schema: z.array(TokenSchema),
  })
}

const getNetworkTokens = (
  networkConfig: EthNetworkConfig | undefined,
  knownEthNetwork: KnownEthNetworkConfig | undefined,
): Token[] => {
  const networkId = networkConfig?.id ?? knownEthNetwork?.id
  if (!networkId) return []

  const knownErc20s = (knownEthNetwork?.balancesConfig?.['evm-erc20']?.tokens ?? []) as EvmErc20TokenBalanceConfig[]
  const configErc20s = (networkConfig?.balancesConfig?.['evm-erc20']?.tokens ?? []) as EvmErc20TokenBalanceConfig[]
  const dicKnownErc20s = keyBy(knownErc20s, (c) => c.contractAddress.toLowerCase())
  const dicConfigErc20s = keyBy(configErc20s, (c) => c.contractAddress.toLowerCase())
  const erc20Configs = uniq(keys(dicKnownErc20s).concat(...keys(dicConfigErc20s))).map((address) =>
    Object.assign({}, dicKnownErc20s[address], dicConfigErc20s[address]),
  )

  const nativeCurrency = Object.assign(
    {},
    knownEthNetwork?.nativeCurrency,
    networkConfig?.nativeCurrency,
  ) as EthNetwork['nativeCurrency']
  const nativeToken = getNativeToken(networkId, nativeCurrency)

  return erc20Configs
    .map((erc20Config): EthToken | null => {
      const token: EvmErc20Token = {
        type: 'evm-erc20',
        id: evmErc20TokenId(networkId, erc20Config.contractAddress as `0x${string}`),
        platform: 'ethereum',
        networkId,
        contractAddress: erc20Config.contractAddress as `0x${string}`,
        symbol: erc20Config.symbol,
        name: erc20Config.name,
        decimals: erc20Config.decimals,
        logo: getAssetUrlFromPath(erc20Config.logo) ?? getAssetPathFromCoingeckoTokenId(erc20Config.coingeckoId),
        mirrorOf: erc20Config.mirrorOf,
        coingeckoId: erc20Config.coingeckoId,
        noDiscovery: erc20Config.noDiscovery,
        isDefault: erc20Config.isDefault,
      }

      // filter out invalid tokens (empty symbol, missing decimals, etc.)
      const parsed = EvmErc20TokenSchema.safeParse(token)
      return parsed.success ? parsed.data : null
    })
    .concat(nativeToken)
    .filter((t): t is EthToken => !!t)
}

const getNativeToken = (networkId: string, nativeCurrency: EthNetwork['nativeCurrency']): EvmNativeToken => {
  const token: EvmNativeToken = {
    type: 'evm-native',
    id: `evm-native-${networkId}`,
    platform: 'ethereum',
    networkId,
    symbol: nativeCurrency.symbol,
    name: nativeCurrency.name,
    decimals: nativeCurrency.decimals ?? 18,
    logo: getAssetUrlFromPath(nativeCurrency.logo),
    coingeckoId: nativeCurrency.coingeckoId,
    mirrorOf: nativeCurrency.mirrorOf,
  }

  try {
    return validateDebug(token, EvmNativeTokenSchema, 'native token')
  } catch (err) {
    throw err
  }
}
