import { readFileSync, writeFileSync } from 'node:fs'

import { evm } from '@polkadot/types/interfaces/definitions'
import { Token, TokenDef } from '@talismn/chaindata-provider'
import { stringify as yamlify } from 'yaml'

import { ConfigChain, ConfigEvmNetwork } from './shared/types.legacy'
import {
  DotBalancesConfigTypes,
  DotNetworkConfig,
  DotNetworkConfigDef,
  EthBalancesConfigTypes,
  EthNetworkConfig,
} from './shared/types.v4'

const migrateDotNetworkV3ToV4 = (network: ConfigChain): DotNetworkConfig => {
  const { id, name = '', rpcs = [] } = network

  // TODO extract native token config if present

  return {
    // required
    id,
    name, // not really required, but keep value if forced
    rpcs,

    // from NetworkBase
    isDefault: network.isDefault || undefined,
    isTestnet: network.isTestnet || undefined,
    themeColor: network.themeColor || undefined,
    blockExplorerUrls: network.subscanUrl ? [network.subscanUrl] : [],

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

  return { decimals, symbol, name, coingeckoId, mirrorOf, logo }
}

const migrateEthNetworkV3ToV4 =
  (dotNetworks: DotNetworkConfig[]) =>
  (network: ConfigEvmNetwork): EthNetworkConfig => {
    const { id, name = '', rpcs = [], balancesConfig, isTestnet } = network

    const dotNetwork = dotNetworks.find((n) => n.id === network.substrateChainId)

    return {
      // required
      id,
      name: dotNetwork?.name ? name || dotNetwork.name : name, // in v3 they are not set for networks tied to a polkadot chain
      rpcs,

      // from NetworkBase
      isTestnet: isTestnet || undefined,
      isDefault: network.isDefault || undefined,
      forceScan: network.forceScan || undefined,
      themeColor: network.themeColor || undefined,
      blockExplorerUrls: network.explorerUrl ? [network.explorerUrl] : [],

      // from EvmNetwork
      substrateChainId: network.substrateChainId || undefined,
      logo: network.logo || undefined,
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
    Object.entries(network.balancesConfig).filter(([key]) => DotBalancesConfigTypes.safeParse(key).success),
  )

  return Object.keys(result).length ? result : undefined
}

const migrateEthBalancesConfig = (network: ConfigChain): EthNetworkConfig['balancesConfig'] => {
  if (!network.balancesConfig) return undefined

  // remove unknown token types
  return Object.fromEntries(
    Object.entries(network.balancesConfig).filter(([key]) => EthBalancesConfigTypes.safeParse(key).success),
  )
}

const chaindata = JSON.parse(readFileSync(`./data/chaindata.json`, 'utf-8'))
const chaindataTestnets = JSON.parse(readFileSync(`./data/testnets-chaindata.json`, 'utf-8')).map((n: ConfigChain) => ({
  ...n,
  isTestnet: true,
}))
const evmNetworks = JSON.parse(readFileSync(`./data/evm-networks.json`, 'utf-8'))

const newDotNetworks = [...chaindata, ...chaindataTestnets].map(migrateDotNetworkV3ToV4)
const newEthNetworks = evmNetworks.map(migrateEthNetworkV3ToV4(newDotNetworks))

writeFileSync(`./data/networks-polkadot.yaml`, yamlify(newDotNetworks))
writeFileSync(`./data/networks-ethereum.yaml`, yamlify(newEthNetworks))
