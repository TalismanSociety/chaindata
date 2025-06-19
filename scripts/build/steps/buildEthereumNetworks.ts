import type { Dictionary } from 'lodash'
import { EthNetwork, EthNetworkSchema, evmNativeTokenId } from '@talismn/chaindata-provider'
import fromPairs from 'lodash/fromPairs'
import keyBy from 'lodash/keyBy'
import * as viemChains from 'viem/chains'
import { z } from 'zod/v4'

import { getConsolidatedKnownEthNetworks } from '../../fetch-external/getConsolidatedEthNetworksOverrides'
import {
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
} from '../../shared/constants'
import { EthNetworkConfig, EthNetworksConfigFileSchema, KnownEthNetworkConfig } from '../../shared/schemas'
import { KnownEthNetworkIconsFileSchema } from '../../shared/schemas/KnownEthNetworkIconCache'
import {
  getNetworkLogoUrl,
  getTokenLogoUrl,
  parseJsonFile,
  parseYamlFile,
  validateDebug,
  writeJsonFile,
} from '../../shared/util'
import { checkDuplicates } from './helpers/checkDuplicates'

export const buildEthereumNetworks = async () => {
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()
  const knownEthNetworksIconCache = parseJsonFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, KnownEthNetworkIconsFileSchema)
  const dicKnownEthNetworksIcons = fromPairs(knownEthNetworksIconCache.map(({ icon, path }) => [icon, path]))

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
    .map((id) => {
      const config = ethNetworkConfigById[id]
      const knownEvmNetwork = knownEthNetworkById[id]
      const viemChain = viemChainById[id]

      return consolidateEthNetwork(config, knownEvmNetwork, viemChain, dicKnownEthNetworksIcons)
    })
    .filter((n): n is EthNetwork => !!n)

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
  dicIcons: Dictionary<string>,
): EthNetwork | null => {
  if (!config && !knownEvmNetwork && !viemChain) return null

  const id = String(config?.id ?? knownEvmNetwork?.id ?? viemChain?.id)

  const rpcs = [
    ...new Set([...(config?.rpcs ?? []), ...(knownEvmNetwork?.rpcs ?? []), ...(viemChain?.rpcUrls.default.http ?? [])]),
  ]
  if (!rpcs.length) return null

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

  const symbol =
    config?.nativeCurrency?.symbol ?? knownEvmNetwork?.nativeCurrency.symbol ?? viemChain?.nativeCurrency.symbol ?? ''

  const nativeCurrency: EthNetwork['nativeCurrency'] = {
    symbol,
    decimals:
      config?.nativeCurrency?.decimals ??
      knownEvmNetwork?.nativeCurrency.decimals ??
      viemChain?.nativeCurrency.decimals ??
      -1,
    name: config?.nativeCurrency?.name ?? knownEvmNetwork?.nativeCurrency.name ?? viemChain?.nativeCurrency.name ?? '',
    coingeckoId: config?.nativeCurrency?.coingeckoId || knownEvmNetwork?.nativeCurrency.coingeckoId,
    logo: getTokenLogoUrl(
      config?.nativeCurrency?.logo ?? knownEvmNetwork?.nativeCurrency?.logo,
      config?.nativeCurrency?.coingeckoId ?? knownEvmNetwork?.nativeCurrency.coingeckoId,
      symbol,
    ),
    mirrorOf: config?.nativeCurrency?.mirrorOf || knownEvmNetwork?.nativeCurrency.mirrorOf,
  }

  if (knownEvmNetwork?.icon) {
  }

  const logo = getNetworkLogoUrl(
    config?.logo ?? knownEvmNetwork?.logo ?? dicIcons[knownEvmNetwork?.icon ?? ''],
    id,
    nativeCurrency,
  )

  const network: EthNetwork = {
    id,
    platform: 'ethereum',
    rpcs,
    name: config?.name ?? knownEvmNetwork?.name ?? viemChain?.name ?? '',
    nativeTokenId: evmNativeTokenId(id),
    nativeCurrency,
    isTestnet: config?.isTestnet || knownEvmNetwork?.isTestnet || viemChain?.testnet || undefined,
    isDefault: (!!config && config.isDefault !== false) || knownEvmNetwork?.isDefault || undefined,
    forceScan: config?.forceScan || knownEvmNetwork?.forceScan || undefined,
    themeColor: config?.themeColor || knownEvmNetwork?.themeColor || undefined,
    logo,
    blockExplorerUrls:
      config?.blockExplorerUrls ?? knownEvmNetwork?.blockExplorerUrls ?? (undefined as unknown as string[]), // zod will replace with empty array

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

  return null
}
