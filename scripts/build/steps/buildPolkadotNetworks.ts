import { existsSync } from 'fs'

import { DotNetwork, DotNetworkSchema, isDotNetwork, subNativeTokenId } from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import { WsRpcHealth } from '../../fetch-external/steps/checkWsRpcs'
import {
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
  FILE_NOVASAMA_METADATA_PORTAL_URLS,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  FILE_RPC_HEALTH_WEBSOCKET,
} from '../../shared/constants'
import {
  DotNetworkConfig,
  DotNetworksConfigFileSchema,
  DotNetworkSpecs,
  DotNetworkSpecsFileSchema,
} from '../../shared/schemas'
import {
  DotNetworkMetadataExtract,
  DotNetworkMetadataExtractsFileSchema,
} from '../../shared/schemas/DotNetworkMetadataExtract'
import { MetadataPortalUrls } from '../../shared/types'
import { getAssetUrlFromPath, parseJsonFile, parseYamlFile, validateDebug, writeJsonFile } from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

export const buildPolkadotNetworks = async () => {
  const dotNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const networkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
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
    .sort((a, b) => a.id.localeCompare(b.id))

  checkDuplicates(dotNetworks)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_POLKADOT, dotNetworks, {
    format: true,
    schema: z.array(DotNetworkSchema),
  })
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

  const tokenLogo = config.nativeCurrency?.logo || getCoingeckoTokenLogoUrl(config.nativeCurrency?.coingeckoId)

  const nativeCurrency = Object.assign(
    {
      symbol: specs.properties.tokenSymbol,
      decimals: specs.properties.tokenDecimals,
      name: specs.properties.tokenSymbol,
    },
    config.nativeCurrency, // allow overriding native currency properties
    {
      logo: tokenLogo ? getAssetUrlFromPath(tokenLogo) : undefined,
    },
  )

  const logoRelativePath = config.logo || findDotNetworkLogo(config) || undefined

  const network: DotNetwork = {
    id: config.id,
    platform: 'polkadot',
    rpcs,
    name: config.name ?? specs.name,
    nativeTokenId: subNativeTokenId(config.id),
    nativeCurrency,
    isTestnet: (config.isTestnet ?? specs.isTestnet) || undefined,
    isDefault: config.isDefault || undefined,
    forceScan: config.forceScan || undefined,
    themeColor: config.themeColor || undefined,
    logo: getAssetUrlFromPath(logoRelativePath),
    blockExplorerUrls: config.blockExplorerUrls?.length ? config.blockExplorerUrls : (undefined as unknown as string[]), // zod will default to empty array
    chainspecQrUrl: config.chainspecQrUrl || metadataPortalUrls?.urls.chainspecQrUrl || undefined,
    latestMetadataQrUrl: config.latestMetadataQrUrl || metadataPortalUrls?.urls.latestMetadataQrUrl || undefined,
    hasExtrinsicSignatureTypePrefix: config.hasCheckMetadataHash || undefined,
    isUnknownFeeToken: config.isUnknownFeeToken || undefined,
    overrideNativeTokenId: config.overrideNativeTokenId || undefined,
    registryTypes: config.registryTypes || undefined,
    signedExtensions: config.signedExtensions || undefined,
    oldPrefix: config.oldPrefix,

    chainName: specs.name,
    specName: specs.runtimeVersion.specName,
    specVersion: specs.runtimeVersion.specVersion,
    genesisHash: specs.genesisHash,

    hasCheckMetadataHash: (config.hasCheckMetadataHash ?? metadataExtracts.hasCheckMetadataHash) || undefined,
    prefix: metadataExtracts.ss58Prefix,
    account: metadataExtracts.account,
    topology: metadataExtracts.topology,
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
  return getCoingeckoTokenLogoUrl(config.nativeCurrency?.coingeckoId)
}

const getCoingeckoTokenLogoUrl = (coingeckoId: string | undefined): string | undefined => {
  if (!coingeckoId) return undefined

  const logoPath = `./assets/tokens/coingecko/${coingeckoId}.webp`
  if (existsSync(logoPath)) return logoPath
}
