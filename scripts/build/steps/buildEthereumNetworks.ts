import { existsSync } from 'fs'

import { EthNetwork, EthNetworkSchema, evmNativeTokenId } from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import * as viemChains from 'viem/chains'
import { z } from 'zod/v4'

import { getConsolidatedKnownEthNetworks } from '../../fetch-external/getConsolidatedEthNetworksOverrides'
import { FILE_INPUT_NETWORKS_ETHEREUM, FILE_OUTPUT_NETWORKS_ETHEREUM } from '../../shared/constants'
import {
  DotNetworkConfig,
  EthNetworkConfig,
  EthNetworksConfigFileSchema,
  KnownEthNetworkConfig,
} from '../../shared/schemas'
import { getAssetUrlFromPath, parseYamlFile, validateDebug, writeJsonFile } from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

export const buildEthereumNetworks = async () => {
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))
  const viemChainById = keyBy(viemChains, (c) => String(c.id))

  const allEthNetworkIds = [
    ...new Set([
      ...Object.keys(ethNetworkConfigById),
      ...Object.keys(knownEthNetworkById),
      ...Object.keys(viemChainById),
    ]),
  ].sort((a, b) => Number(a) - Number(b))

  const ethNetworks: EthNetwork[] = allEthNetworkIds
    //.filter((id) => Number(id) < 10)
    .map((id) => {
      const config = ethNetworkConfigById[id]
      const knownEvmNetwork = knownEthNetworkById[id]
      const viemChain = viemChainById[id]

      return consolidateEthNetwork(config, knownEvmNetwork, viemChain)
    })
    .filter((n): n is EthNetwork => !!n)

  // const ethNetworks:EthNetwork = ethNetworksConfig
  //   // .map((config) =>
  //   //   consolidateDotNetwork(
  //   //     config,
  //   //     dicSpecs[config.id],
  //   //     dicMetadataExtracts[config.id],
  //   //     rpcsHealth,
  //   //     dicMetadataPortalUrls[config.id],
  //   //   ),
  //   // )
  //   // .filter(isDotNetwork)
  //   .sort((a, b) => Number(a.id) - Number(b.id))

  checkDuplicates(ethNetworks)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_ETHEREUM, ethNetworks, {
    format: true,
    schema: z.array(EthNetworkSchema),
  })
}

const consolidateEthNetwork = (
  config: EthNetworkConfig | undefined,
  knownEvmNetwork: KnownEthNetworkConfig | undefined,
  viemChain: viemChains.Chain | undefined,
): EthNetwork | null => {
  if (!config && !knownEvmNetwork && !viemChain) return null

  // viemChain?.contracts.

  const id = String(config?.id ?? knownEvmNetwork?.id ?? viemChain?.id)

  const rpcs = [
    ...new Set([...(config?.rpcs ?? []), ...(knownEvmNetwork?.rpcs ?? []), ...(viemChain?.rpcUrls.default.http ?? [])]),
  ]
  if (!rpcs.length) return null

  // console.log(`Consolidating Ethereum network ${id} `)
  // console.log({
  //   config,
  //   knownEvmNetwork,
  //   viemChain,
  // })

  const viemContracts: EthNetwork['contracts'] = viemChain?.contracts?.multicall3
    ? {
        Multicall3: viemChain?.contracts?.multicall3.address,
      }
    : {}

  const contracts: EthNetwork['contracts'] = Object.assign(
    {},
    config?.contracts ?? {},
    knownEvmNetwork?.contracts ?? {},
    viemContracts,
  )

  const network: EthNetwork = {
    id,
    platform: 'ethereum',
    rpcs,
    name: config?.name ?? knownEvmNetwork?.name ?? viemChain?.name ?? '',
    nativeTokenId: evmNativeTokenId(id),
    nativeCurrency: {
      symbol:
        config?.nativeCurrency?.symbol ??
        knownEvmNetwork?.nativeCurrency.symbol ??
        viemChain?.nativeCurrency.symbol ??
        '',
      decimals:
        config?.nativeCurrency?.decimals ??
        knownEvmNetwork?.nativeCurrency.decimals ??
        viemChain?.nativeCurrency.decimals ??
        -1,
      name:
        config?.nativeCurrency?.name ?? knownEvmNetwork?.nativeCurrency.name ?? viemChain?.nativeCurrency.name ?? '',
      coingeckoId: config?.nativeCurrency?.coingeckoId || knownEvmNetwork?.nativeCurrency.coingeckoId,
      logo: getAssetUrlFromPath(config?.nativeCurrency?.logo || knownEvmNetwork?.nativeCurrency.logo),
      mirrorOf: config?.nativeCurrency?.mirrorOf || knownEvmNetwork?.nativeCurrency.mirrorOf,
    },
    isTestnet: config?.isTestnet || knownEvmNetwork?.isTestnet || viemChain?.testnet || undefined,
    isDefault: (!!config && config.isDefault !== false) || knownEvmNetwork?.isDefault || undefined,
    forceScan: config?.forceScan || knownEvmNetwork?.forceScan || undefined,
    themeColor: config?.themeColor || knownEvmNetwork?.themeColor || undefined,
    logo: getAssetUrlFromPath(config?.logo || knownEvmNetwork?.logo),
    blockExplorerUrls: config?.blockExplorerUrls ?? knownEvmNetwork?.blockExplorerUrls ?? undefined,

    // TODO
    contracts: Object.keys(contracts).length ? contracts : undefined,
    feeType: config?.feeType || knownEvmNetwork?.feeType || undefined,
    l2FeeType: config?.l2FeeType || knownEvmNetwork?.l2FeeType || undefined,
    substrateChainId: config?.substrateChainId || knownEvmNetwork?.substrateChainId || undefined,
    preserveGasEstimate: config?.preserveGasEstimate || knownEvmNetwork?.preserveGasEstimate || undefined,
  }

  try {
    return validateDebug(network, EthNetworkSchema, `Failed to validate EthNetwork ${id}`)
  } catch (cause) {
    console.warn(`Failed to validate EthNetwork ${id}`, cause)
  }

  // catch (cause) {

  return null
}

// const consolidateDotNetwork = (
//   config: DotNetworkConfig,
//   specs: DotNetworkSpecs,
//   metadataExtracts: DotNetworkMetadataExtract,
//   rpcsHealth: Record<string, WsRpcHealth>,
//   metadataPortalUrls: MetadataPortalUrls[number] | null,
// ): DotNetwork | null => {
//   if (!specs || !metadataExtracts) return null

//   const rpcs = [
//     ...(config.rpcs?.filter((url) => rpcsHealth[url] === 'OK') ?? []),
//     ...(config.rpcs?.filter((url) => rpcsHealth[url]) ?? []), // new rpcs, assume better than MEH - there should not be any though
//     ...(config.rpcs?.filter((url) => rpcsHealth[url] === 'MEH') ?? []),
//     // ignore NOK ones
//   ]
//   if (!rpcs.length) return null // no rpcs available for this network - cant be updated

//   const nativeCurrency = Object.assign(
//     {
//       symbol: specs.properties.tokenSymbol,
//       decimals: specs.properties.tokenDecimals,
//       name: specs.properties.tokenSymbol,
//     },
//     config.nativeCurrency, // allow overriding native currency properties
//     {
//       logo:
//         getAssetUrlFromPath(config.nativeCurrency?.logo) ||
//         getCoingeckoTokenLogoUrl(config.nativeCurrency?.coingeckoId) ||
//         undefined,
//     },
//   )

//   const logoRelativePath = config.logo || findDotNetworkLogo(config) || undefined

//   const network: DotNetwork = {
//     id: config.id,
//     platform: 'polkadot',
//     rpcs,
//     name: config.name ?? specs.name,
//     nativeTokenId: subNativeTokenId(config.id),
//     nativeCurrency,
//     isTestnet: (config.isTestnet ?? specs.isTestnet) || undefined,
//     isDefault: config.isDefault || undefined,
//     forceScan: config.forceScan || undefined,
//     themeColor: config.themeColor || undefined,
//     logo: getAssetUrlFromPath(logoRelativePath),
//     blockExplorerUrls: config.blockExplorerUrls?.length ? config.blockExplorerUrls : undefined,
//     chainspecQrUrl: config.chainspecQrUrl || metadataPortalUrls?.urls.chainspecQrUrl || undefined,
//     latestMetadataQrUrl: config.latestMetadataQrUrl || metadataPortalUrls?.urls.latestMetadataQrUrl || undefined,
//     hasExtrinsicSignatureTypePrefix: config.hasCheckMetadataHash || undefined,
//     isUnknownFeeToken: config.isUnknownFeeToken || undefined,
//     overrideNativeTokenId: config.overrideNativeTokenId || undefined,
//     registryTypes: config.registryTypes || undefined,
//     signedExtensions: config.signedExtensions || undefined,
//     oldPrefix: config.oldPrefix,

//     specName: specs.runtimeVersion.specName,
//     specVersion: specs.runtimeVersion.specVersion,
//     genesisHash: specs.genesisHash,

//     hasCheckMetadataHash: (config.hasCheckMetadataHash ?? metadataExtracts.hasCheckMetadataHash) || undefined,
//     prefix: metadataExtracts.ss58Prefix,
//     account: metadataExtracts.account,
//     topologyInfo: metadataExtracts.topologyInfo,
//   }

//   try {
//     return validateDebug(network, DotNetworkSchema, `Failed to validate DotNetwork ${config.id}`)
//   } catch (cause) {
//     console.warn(`Failed to validate DotNetwork ${config.id}`, cause)
//     return null
//   }
// }

const findEthNetworkLogo = (config: DotNetworkConfig): string | undefined => {
  for (const ext of ['svg', 'png', 'webp']) {
    const logoPath = `./assets/chains/${config.id}.${ext}`
    if (existsSync(logoPath)) return logoPath
  }

  // fallback to coingecko logo of the native token
  return getCoingeckoTokenLogoUrl(config.nativeCurrency?.coingeckoId)
}

const getCoingeckoTokenLogoUrl = (coingeckoId: string | undefined): string | undefined => {
  if (!coingeckoId) return undefined

  const logoPath = `./assets/tokens/coingecko/${coingeckoId}.webp`
  if (existsSync(logoPath)) return logoPath
}
