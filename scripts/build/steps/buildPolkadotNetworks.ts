import { DotNetwork, DotNetworkSchema, isNetworkDot, subNativeTokenId } from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import uniq from 'lodash/uniq'
import { z } from 'zod/v4'

import { isNotBlacklistedRpcUrl } from '../../shared/blacklistedRpcs'
import { checkDuplicates } from '../../shared/checkDuplicates'
import {
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
  FILE_NETWORKS_SPECS_POLKADOT,
  FILE_NOVASAMA_METADATA_PORTAL_URLS,
  FILE_OUTPUT_NETWORKS_POLKADOT,
} from '../../shared/constants'
import { getNetworkLogoUrl, getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
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
import { validateDebug } from '../../shared/validate'
import { writeJsonFile } from '../../shared/writeFile'

export const buildPolkadotNetworks = async () => {
  const dotNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const networkSpecs = parseJsonFile(FILE_NETWORKS_SPECS_POLKADOT, DotNetworkSpecsFileSchema)
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
        dicMetadataPortalUrls[config.id],
      ),
    )
    .filter(isNetworkDot)
    .sort((a, b) => a.id.localeCompare(b.id))

  checkDuplicates(dotNetworks)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_POLKADOT, dotNetworks, {
    schema: z.array(DotNetworkSchema),
  })
}

const consolidateDotNetwork = (
  config: DotNetworkConfig,
  specs: DotNetworkSpecs,
  metadataExtracts: DotNetworkMetadataExtract,
  metadataPortalUrls: MetadataPortalUrls[number] | null,
): DotNetwork | null => {
  if (!specs || !metadataExtracts) return null

  const okRpcs = getRpcsByStatus(config.id, 'polkadot', 'OK')
  const mehRpcs = getRpcsByStatus(config.id, 'polkadot', 'MEH')
  const allRpcs = getRpcsByStatus(config.id, 'polkadot', 'all')

  const rpcs = uniq([
    ...config.rpcs?.filter((url) => okRpcs.includes(url)),
    ...config.rpcs?.filter((url) => !allRpcs.includes(url)), // new rpcs, assume better than MEH - there should not be any though
    ...config.rpcs?.filter((url) => mehRpcs.includes(url)),
    // ignore NOK ones
  ]).filter(isNotBlacklistedRpcUrl)

  if (!rpcs.length) return null // no rpcs available for this network - cant be updated

  const nativeCurrency = Object.assign(
    {
      symbol: specs.properties.tokenSymbol,
      decimals: specs.properties.tokenDecimals,
      name: specs.properties.tokenSymbol,
    },
    config.nativeCurrency, // allow overriding native currency properties
    {
      logo: getTokenLogoUrl(
        config.nativeCurrency?.logo,
        config.nativeCurrency?.coingeckoId,
        config.nativeCurrency?.symbol,
      ),
    },
  )

  const isTestnet = config.isTestnet ?? specs.isTestnet

  const network: DotNetwork = {
    id: config.id,
    platform: 'polkadot',
    rpcs,
    name: config.name ?? specs.name,
    nativeTokenId: config.nativeTokenId ?? subNativeTokenId(config.id),
    nativeCurrency,
    isTestnet,
    isDefault: config.isDefault || !config.isTestnet || undefined,
    forceScan: config.forceScan || undefined,
    themeColor: config.themeColor || undefined,
    logo: getNetworkLogoUrl(config.logo, config.id, nativeCurrency),
    blockExplorerUrls: config.blockExplorerUrls?.length ? config.blockExplorerUrls : (undefined as unknown as string[]), // zod will default to empty array
    chainspecQrUrl: config.chainspecQrUrl || metadataPortalUrls?.urls.chainspecQrUrl || undefined,
    latestMetadataQrUrl: config.latestMetadataQrUrl || metadataPortalUrls?.urls.latestMetadataQrUrl || undefined,
    hasExtrinsicSignatureTypePrefix: config.hasCheckMetadataHash || undefined,
    isUnknownFeeToken: config.isUnknownFeeToken || undefined,
    registryTypes: config.registryTypes || undefined,
    signedExtensions: config.signedExtensions || undefined,
    oldPrefix: config.oldPrefix,
    balancesConfig: config.balancesConfig || undefined,

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
