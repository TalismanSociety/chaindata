import { native } from 'bun:sqlite'
import assign from 'lodash/assign'
import keys from 'lodash/keys'

import {
  FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES,
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_INPUT_NETWORKS_POLKADOT,
} from './shared/constants'
import {
  DotBalancesConfigTypes,
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  EthBalancesConfigTypes,
  EthNetworkConfig,
  EthNetworksConfigFileSchema,
  KnownEthNetworkOverrides,
  KnownEthNetworksOverridesFileSchema,
} from './shared/schemas'
import { ConfigChain, ConfigEvmNetwork } from './shared/types'
import { parseJsonFile, writeYamlFile } from './shared/util'

const migrateUrl = (url: string | undefined): string | undefined => {
  return url?.replace('https://raw.githubusercontent.com/TalismanSociety/chaindata/main/', './')
}

const migrateDotNetworkV3ToV4 = (network: ConfigChain): DotNetworkConfig => {
  const { id, name = '', rpcs = [] } = network

  return {
    // required
    id,
    relay: network.relay?.id || undefined,
    name, // not really required, but keep value if forced
    rpcs,

    // from NetworkBase
    isDefault: network.isDefault || undefined,
    isTestnet: network.isTestnet || undefined,
    themeColor: network.themeColor || undefined,
    blockExplorerUrls: network.subscanUrl ? [network.subscanUrl] : undefined,

    // polkadot specific
    chainspecQrUrl: network.chainspecQrUrl || undefined,
    latestMetadataQrUrl: network.latestMetadataQrUrl || undefined,
    oldPrefix: network.oldPrefix || undefined,
    registryTypes: network.registryTypes || undefined,
    signedExtensions: network.signedExtensions || undefined,
    hasCheckMetadataHash: network.hasCheckMetadataHash || undefined,
    hasExtrinsicSignatureTypePrefix: network.hasExtrinsicSignatureTypePrefix || undefined,
    isUnknownFeeToken: network.isUnknownFeeToken || undefined,
    nativeTokenId: network.overrideNativeTokenId?.replace('-substrate-tokens-', ':substrate-tokens:') || undefined,

    balancesConfig: migrateDotBalancesConfig(network),
    nativeCurrency: migrateDotNativeCurrency(network),
    tokens: migrateDotTokensConfig(network),
  }
}

const migrateDotNativeCurrency = (network: ConfigChain): DotNetworkConfig['nativeCurrency'] => {
  const nativeModule = network.balancesConfig?.['substrate-native']

  if (!nativeModule) return undefined

  const { decimals, symbol, name, coingeckoId, mirrorOf, logo } = nativeModule as Exclude<
    DotNetworkConfig['nativeCurrency'],
    undefined
  >

  return { decimals, symbol, name, coingeckoId, mirrorOf, logo: migrateUrl(logo) }
}

const migrateDotBalancesConfig = (network: ConfigChain): DotNetworkConfig['balancesConfig'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const result = Object.fromEntries(
    Object.entries(network.balancesConfig)
      .map(([key, value]) => {
        const { tokens, pools, ...rest } = value

        return [key, rest]
      })
      .filter(([key, value]) => {
        return keys(value).length && DotBalancesConfigTypes.safeParse(key).success
      }),
  )

  return Object.keys(result).length ? result : undefined
}

const migrateDotTokensConfig = (network: ConfigChain): DotNetworkConfig['tokens'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const result = Object.fromEntries(
    Object.entries(network.balancesConfig)
      .map(([type, value]) => {
        // @ts-ignore
        const entries: any[] = value.tokens || []
        return [type, entries.map(({ ed, ...rest }) => (ed ? { ...rest, existentialDeposit: ed } : rest))]
      })
      .filter(([type, values]) => values.length && DotBalancesConfigTypes.safeParse(type).success),
  )

  return Object.keys(result).length ? result : undefined
}

const getChaindataV4TokenId = (oldTokenId: string): string | null => {
  if (oldTokenId.includes('-evm-native')) return oldTokenId.replace('-evm-native', ':evm-native')

  if (oldTokenId.includes('-evm-erc20-')) return oldTokenId.replace('-evm-erc20-', ':evm-erc20:')

  if (oldTokenId.includes('-evm-uniswapv2-')) return oldTokenId.replace('-evm-erc20-', ':evm-erc20:')

  if (oldTokenId.includes('-substrate-native')) return oldTokenId.replace('-substrate-native', ':substrate-native')

  if (oldTokenId.includes('-substrate-tokens-')) return oldTokenId.replace('-substrate-tokens-', ':substrate-tokens:')

  if (oldTokenId.includes('-substrate-psp22-')) return oldTokenId.replace('-substrate-psp22-', ':substrate-psp22:')

  if (oldTokenId.includes('-substrate-assets-'))
    return oldTokenId
      .replace('-substrate-assets-', ':substrate-assets:')
      .split('-')
      .slice(0, -1) // remove symbol at the end
      .join(':')

  if (oldTokenId.includes('-substrate-equilibrium-')) return null // deprecated

  if (oldTokenId.includes('-substrate-foreignassets-')) {
    console.warn('Unable to migrate foreign asset token ID', oldTokenId)
    return null
  }

  console.warn(`Unknown token ID format: ${oldTokenId}, cannot migrate to chaindata v4`)
  return null
}

const migrateEthNetworkV3ToV4 =
  (dotNetworks: DotNetworkConfig[]) =>
  (network: ConfigEvmNetwork): EthNetworkConfig => {
    const { id, name, rpcs = [], balancesConfig, isTestnet } = network

    const dotNetwork = dotNetworks.find((n) => n.id === network.substrateChainId)

    let nativeCurrency: EthNetworkConfig['nativeCurrency'] | undefined = undefined
    const oldNativeModule = balancesConfig?.['evm-native']
    if (oldNativeModule) {
      nativeCurrency = assign(
        {} as EthNetworkConfig['nativeCurrency'],
        oldNativeModule as EthNetworkConfig['nativeCurrency'],
      )
      if (nativeCurrency) {
        if ('dcentName' in nativeCurrency) delete nativeCurrency['dcentName']
        if ('mirrorOf' in nativeCurrency)
          nativeCurrency.mirrorOf = getChaindataV4TokenId(nativeCurrency.mirrorOf!) ?? undefined
        nativeCurrency.logo = migrateUrl(nativeCurrency.logo) || undefined
      }
    }

    return {
      // required
      id,
      name: !name && dotNetwork?.name ? dotNetwork.name : name, // in v3 they are not set for networks tied to a polkadot chain
      rpcs,

      nativeCurrency,

      // from NetworkBase
      isTestnet: isTestnet || undefined,
      isDefault: network.isDefault || undefined,
      forceScan: network.forceScan || undefined,
      themeColor: network.themeColor || undefined,
      blockExplorerUrls: network.explorerUrl ? [network.explorerUrl] : undefined,

      // from EvmNetwork
      substrateChainId: network.substrateChainId || undefined,
      logo: migrateUrl(network.logo) || undefined,
      preserveGasEstimate: network.preserveGasEstimate || undefined,
      feeType: network.feeType || undefined,
      l2FeeType: network.l2FeeType || undefined,
      contracts: network.erc20aggregator
        ? {
            Erc20Aggregator: network.erc20aggregator,
          }
        : undefined,

      balancesConfig: migrateEthBalancesConfig(network),
      tokens: migrateEthTokensConfig(network),
    }
  }

const migrateEthBalancesConfig = (network: ConfigEvmNetwork): EthNetworkConfig['balancesConfig'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const balancesConfig = Object.fromEntries(
    Object.entries(network.balancesConfig)
      .map(([key, value]) => {
        const { tokens, pools, ...rest } = value

        return [key, rest]
      })
      .filter(([key, value]) => {
        return keys(value).length && EthBalancesConfigTypes.safeParse(key).success
      }),
  )

  return Object.keys(balancesConfig).length ? balancesConfig : undefined
}

const migrateEthTokensConfig = (network: ConfigChain): EthNetworkConfig['tokens'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const result = Object.fromEntries(
    Object.entries(network.balancesConfig)
      .map(([type, value]) => {
        // @ts-ignore
        const entries: any[] = value.tokens || value.pools || []
        return [type, entries]
      })
      .filter(([type, values]) => values.length && EthBalancesConfigTypes.safeParse(type).success),
  )

  return Object.keys(result).length ? result : undefined
}

type LegacyNetworkOverrides = Partial<ConfigChain> & { id: string }
const migrateEvmNetworksOverrides = (
  overrides: Partial<ConfigEvmNetwork> & { id: string },
): KnownEthNetworkOverrides => {
  return {
    id: overrides.id,
    rpcs: overrides.rpcs || undefined,
    substrateChainId: overrides.substrateChainId || undefined,
    forceScan: overrides.forceScan || undefined,
    isDefault: overrides.isDefault || undefined,
    isTestnet: overrides.isTestnet || undefined,
    name: overrides.name || undefined,
    logo: migrateUrl(overrides.logo) || undefined,
    themeColor: overrides.themeColor || undefined,
    blockExplorerUrls: overrides.explorerUrl ? [overrides.explorerUrl] : undefined,
    contracts: overrides.erc20aggregator
      ? {
          Erc20Aggregator: overrides.erc20aggregator,
        }
      : undefined,
    nativeCurrency: overrides.balancesConfig?.['evm-native'],
    feeType: overrides.feeType,
    l2FeeType: overrides.l2FeeType,
    preserveGasEstimate: overrides.preserveGasEstimate || undefined,
    balancesConfig: migrateEthBalancesConfig(overrides),
    tokens: migrateEthTokensConfig(overrides),
  }
}

const chaindata = parseJsonFile<ConfigChain[]>(`data/chaindata.json`)
const chaindataTestnets = parseJsonFile<ConfigChain[]>(`data/testnets-chaindata.json`).map((n) => ({
  ...n,
  isTestnet: true,
}))
const evmNetworks = parseJsonFile<ConfigEvmNetwork[]>(`data/evm-networks.json`)

const knownNetworksOverrides = parseJsonFile<LegacyNetworkOverrides[]>(`data/known-evm-networks-overrides.json`)

const newDotNetworks = [...chaindata, ...chaindataTestnets].map(migrateDotNetworkV3ToV4)

const newEthNetworks = evmNetworks
  .map(migrateEthNetworkV3ToV4(newDotNetworks))
  .sort((n1, n2) => Number(n1.id) - Number(n2.id))

const newKnownNetworksOverrides = knownNetworksOverrides
  .map(migrateEvmNetworksOverrides)
  .sort((n1, n2) => Number(n1.id) - Number(n2.id))

writeYamlFile(FILE_INPUT_NETWORKS_POLKADOT, newDotNetworks, { format: true, schema: DotNetworksConfigFileSchema })
writeYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, newEthNetworks, { format: true, schema: EthNetworksConfigFileSchema })
writeYamlFile(FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, newKnownNetworksOverrides, {
  format: true,
  schema: KnownEthNetworksOverridesFileSchema,
})
