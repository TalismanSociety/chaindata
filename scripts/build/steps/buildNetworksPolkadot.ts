import { existsSync } from 'fs'

import { subNativeTokenId } from '@talismn/balances'
import { DotNetwork, DotNetworkExtended, DotNetworkSchema, isDotNetwork } from '@talismn/chaindata'
import keyBy from 'lodash/keyBy'

import { WsRpcHealth } from '../../fetch-external/steps/checkWsRpcs'
import {
  FILE_CACHE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_CACHE_NETWORKS_SPECS_POLKADOT,
  FILE_NETWORKS_POLKADOT,
  FILE_NOVASAMA_METADATA_PORTAL_URLS,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  FILE_RPC_HEALTH_WEBSOCKET,
} from '../../shared/constants'
import {
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  DotNetworkSpecs,
  DotNetworkSpecsFileSchema,
  DotNetworkSpecsSchema,
} from '../../shared/schemas'
import {
  DotNetworkMetadataExtract,
  DotNetworkMetadataExtractsFileSchema,
} from '../../shared/schemas/DotNetworkMetadataExtract'
import { MetadataPortalUrls } from '../../shared/types'
import { parseJsonFile, parseYamlFile, validateDebug, writeJsonFile } from '../../shared/util'

export const buildNetworksPolkadot = async () => {
  const dotNetworksConfig = parseYamlFile(FILE_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const metadataExtracts = parseJsonFile(
    FILE_CACHE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
    DotNetworkMetadataExtractsFileSchema,
  )
  const networkSpecs = parseJsonFile(FILE_CACHE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
  const rpcsHealth = parseJsonFile<Record<string, WsRpcHealth>>(FILE_RPC_HEALTH_WEBSOCKET)
  const novaMetatadaPortalConfig = parseJsonFile<MetadataPortalUrls>(FILE_NOVASAMA_METADATA_PORTAL_URLS)

  const dicSpecs = keyBy(networkSpecs, 'id')
  const dicMetadataExtracts = keyBy(metadataExtracts, 'id')
  const dicMetadataPortalUrls = keyBy(novaMetatadaPortalConfig, 'id')

  const dotNetworks = dotNetworksConfig
    .map((config) =>
      consolidateDotNetwork(
        config,
        dicSpecs[config.id],
        dicMetadataExtracts[config.id],
        rpcsHealth,
        dicMetadataPortalUrls[config.id],
      ),
    )
    .filter(isDotNetwork)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_POLKADOT, dotNetworks)
}

const consolidateDotNetwork = (
  config: DotNetworkConfig,
  specs: DotNetworkSpecs,
  metadataExtracts: DotNetworkMetadataExtract,
  rpcsHealth: Record<string, WsRpcHealth>,
  metadataPortalUrls: MetadataPortalUrls[number] | null,
): DotNetwork | null => {
  if (!specs || !metadataExtracts) return null

  const rpcs = [
    ...(config.rpcs?.filter((url) => rpcsHealth[url] === 'OK') ?? []),
    ...(config.rpcs?.filter((url) => rpcsHealth[url]) ?? []), // new rpcs, assume better than MEH - there should not be any though
    ...(config.rpcs?.filter((url) => rpcsHealth[url] === 'MEH') ?? []),
    // ignore NOK ones
  ]
  if (!rpcs.length) return null // no rpcs available for this network - cant be updated

  const nativeCurrency = Object.assign(
    {
      symbol: specs.properties.tokenSymbol,
      decimals: specs.properties.tokenDecimals,
      name: specs.properties.tokenSymbol,
    },
    config.nativeCurrency, // allow overriding native currency properties
  )

  const network: DotNetwork = {
    id: config.id,
    platform: 'polkadot',
    rpcs,
    name: config.name ?? specs.name,
    nativeTokenId: subNativeTokenId(config.id),
    nativeCurrency,
    specName: specs.runtimeVersion.specName,
    specVersion: specs.runtimeVersion.specVersion,
    genesisHash: specs.genesisHash,
    isTestnet: (config.isTestnet ?? specs.isTestnet) || undefined,
    isDefault: config.isDefault || undefined,
    forceScan: config.forceScan || undefined,
    themeColor: config.themeColor || undefined,
    logo: config.logo || findDotNetworkLogo(config) || undefined,
    account: metadataExtracts.account,
    hasCheckMetadataHash: metadataExtracts.hasCheckMetadataHash,
    blockExplorerUrls: config.blockExplorerUrls?.length ? config.blockExplorerUrls : undefined,
    prefix: metadataExtracts.ss58Prefix,
    oldPrefix: config.oldPrefix,
    chainspecQrUrl: config.chainspecQrUrl || metadataPortalUrls?.urls.chainspecQrUrl || undefined,
    latestMetadataQrUrl: config.latestMetadataQrUrl || metadataPortalUrls?.urls.latestMetadataQrUrl || undefined,
    hasExtrinsicSignatureTypePrefix: config.hasCheckMetadataHash || undefined,
    isUnknownFeeToken: config.isUnknownFeeToken || undefined,
    overrideNativeTokenId: config.overrideNativeTokenId || undefined,
    registryTypes: config.registryTypes || undefined,
    signedExtensions: config.signedExtensions || undefined,

    // TODO
    isRelay: false,
    paraId: undefined,
    relayId: undefined,
  }

  try {
    return validateDebug(network, DotNetworkSchema, `Failed to validate DotNetwork ${config.id}`)
  } catch (cause) {
    console.warn(`Failed to validate DotNetwork ${config.id}`, cause)
    return null
  }
}

const findDotNetworkLogo = (config: DotNetworkConfig): string | undefined => {
  for (const ext of ['svg', 'png', 'webp']) {
    const logoPath = `./assets/chains/${config.id}.${ext}`
    if (existsSync(logoPath)) return logoPath
  }

  // fallback to coingecko logo of the native token
  if (config.nativeCurrency?.coingeckoId) {
    const logoPath = `./assets/tokens/coingecko/${config.nativeCurrency.coingeckoId}.webp`
    if (existsSync(logoPath)) return logoPath
  }
}
