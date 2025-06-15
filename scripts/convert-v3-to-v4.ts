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
    //account: chain.account as DotNetwork["account"] ?? "*25519", // could be determined automatically by inspecting the Address type in the metadata - also some chains support both (ex: hydration) so we might need to rework this
    chainspecQrUrl: network.chainspecQrUrl || undefined,
    latestMetadataQrUrl: network.latestMetadataQrUrl || undefined,
    oldPrefix: network.oldPrefix || undefined,
    registryTypes: network.registryTypes || undefined,
    signedExtensions: network.signedExtensions || undefined,
    hasCheckMetadataHash: network.hasCheckMetadataHash || undefined,
    hasExtrinsicSignatureTypePrefix: network.hasExtrinsicSignatureTypePrefix || undefined,
    isUnknownFeeToken: network.isUnknownFeeToken || undefined,

    // yuk!
    balancesConfig: migrateDotBalancesConfig(network),
    nativeCurrency: migrateDotNativeCurrency(network),
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

const migrateEthNetworkV3ToV4 =
  (dotNetworks: DotNetworkConfig[]) =>
  (network: ConfigEvmNetwork): EthNetworkConfig => {
    const { id, name, rpcs = [], balancesConfig, isTestnet } = network

    const dotNetwork = dotNetworks.find((n) => n.id === network.substrateChainId)

    return {
      // required
      id,
      name: !name && dotNetwork?.name ? dotNetwork.name : name, // in v3 they are not set for networks tied to a polkadot chain
      rpcs,

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
    }
  }

const migrateDotBalancesConfig = (network: ConfigChain): DotNetworkConfig['balancesConfig'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const result = Object.fromEntries(
    Object.entries(network.balancesConfig).filter(([key]) => {
      return DotBalancesConfigTypes.safeParse(key).success
    }),
  )

  return Object.keys(result).length ? result : undefined
}

const migrateEthBalancesConfig = (network: ConfigEvmNetwork): EthNetworkConfig['balancesConfig'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  const balancesConfig = Object.fromEntries(
    Object.entries(network.balancesConfig).filter(([key]) => {
      return EthBalancesConfigTypes.safeParse(key).success
    }),
  )

  return Object.keys(balancesConfig).length ? balancesConfig : undefined
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
// validate(newDotNetworks, DotNetworksConfigFileSchema)

const newEthNetworks = evmNetworks
  .map(migrateEthNetworkV3ToV4(newDotNetworks))
  .sort((n1, n2) => Number(n1.id) - Number(n2.id))
// validate(newEthNetworks, EthNetworksConfigFileSchema)

const newKnownNetworksOverrides = knownNetworksOverrides
  .map(migrateEvmNetworksOverrides)
  .sort((n1, n2) => Number(n1.id) - Number(n2.id))
//console.log(newKnownNetworksOverrides[15])
// validate(newKnownNetworksOverrides, KnownEthNetworksOverridesFileSchema)

writeYamlFile(FILE_INPUT_NETWORKS_POLKADOT, newDotNetworks, { format: true, schema: DotNetworksConfigFileSchema })
writeYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, newEthNetworks, { format: true, schema: EthNetworksConfigFileSchema })
writeYamlFile(FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES, newKnownNetworksOverrides, {
  format: true,
  schema: KnownEthNetworksOverridesFileSchema,
})
