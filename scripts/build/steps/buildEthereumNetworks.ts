import { EthNetwork, EthNetworkSchema, evmNativeTokenId } from '@talismn/chaindata-provider'
import { type Dictionary } from 'lodash'
import fromPairs from 'lodash/fromPairs'
import keyBy from 'lodash/keyBy'
import uniq from 'lodash/uniq'
import { Chain } from 'viem'
import { z } from 'zod/v4'

import { isNotBlacklistedRpcUrl } from '../../shared/blacklistedRpcs'
import { checkDuplicates } from '../../shared/checkDuplicates'
import {
  FILE_INPUT_NETWORKS_ETHEREUM,
  FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE,
  FILE_OUTPUT_NETWORKS_ETHEREUM,
} from '../../shared/constants'
import { getConsolidatedKnownEthNetworks } from '../../shared/getConsolidatedEthNetworksOverrides'
import { getNetworkLogoUrl, getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import { EthNetworkConfig, EthNetworksConfigFileSchema, KnownEthNetworkConfig } from '../../shared/schemas'
import { KnownEthNetworkIconsFileSchema } from '../../shared/schemas/KnownEthNetworkIconCache'
import { validateDebug } from '../../shared/validate'
import { VIEM_CHAINS } from '../../shared/viemChains'
import { writeJsonFile } from '../../shared/writeFile'

export const buildEthereumNetworks = async () => {
  const ethNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownEthNetworks = getConsolidatedKnownEthNetworks()
  const knownEthNetworksIconCache = parseJsonFile(FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE, KnownEthNetworkIconsFileSchema)
  const dicKnownEthNetworksIcons = fromPairs(knownEthNetworksIconCache.map(({ icon, path }) => [icon, path]))

  const ethNetworkConfigById = keyBy(ethNetworksConfig, (c) => String(c.id))
  const knownEthNetworkById = keyBy(knownEthNetworks, (c) => String(c.id))

  const allEthNetworkIds = [
    ...new Set([
      ...Object.keys(ethNetworkConfigById),
      ...Object.keys(knownEthNetworkById),
      ...Object.keys(VIEM_CHAINS),
    ]),
  ].sort((a, b) => Number(a) - Number(b))

  const ethNetworks: EthNetwork[] = allEthNetworkIds
    .map((id) => {
      const config = ethNetworkConfigById[id]
      const knownEvmNetwork = knownEthNetworkById[id]
      const viemChain = VIEM_CHAINS[id]

      return consolidateEthNetwork(config, knownEvmNetwork, viemChain, dicKnownEthNetworksIcons)
    })
    .filter((n): n is EthNetwork => !!n)

  checkDuplicates(ethNetworks)

  await writeJsonFile(FILE_OUTPUT_NETWORKS_ETHEREUM, ethNetworks, {
    schema: z.array(EthNetworkSchema),
  })
}

const consolidateEthNetwork = (
  config: EthNetworkConfig | undefined,
  knownEvmNetwork: KnownEthNetworkConfig | undefined,
  viemChain: Chain | undefined,
  dicIcons: Dictionary<string>,
): EthNetwork | null => {
  if (!config && !knownEvmNetwork && !viemChain) return null

  const id = String(config?.id ?? knownEvmNetwork?.id ?? viemChain?.id)

  const okRpcs = getRpcsByStatus(id, 'ethereum', 'OK')
  const mehRpcs = getRpcsByStatus(id, 'ethereum', 'MEH')
  const allRpcs = getRpcsByStatus(id, 'polkadot', 'all')

  const rpcs = uniq([
    ...(config?.rpcs?.filter((url) => okRpcs.includes(url)) ?? []),
    ...(config?.rpcs?.filter((url) => !allRpcs.includes(url)) ?? []), // new rpcs, assume better than MEH - there should not be any though
    ...(config?.rpcs?.filter((url) => mehRpcs.includes(url)) ?? []),

    ...(knownEvmNetwork?.rpcs ?? []).filter((url) => okRpcs.includes(url)),
    ...(knownEvmNetwork?.rpcs ?? []).filter((url) => mehRpcs.includes(url)),
  ]).filter(isNotBlacklistedRpcUrl)

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
    name:
      config?.nativeCurrency?.name ?? knownEvmNetwork?.nativeCurrency.name ?? viemChain?.nativeCurrency.name ?? symbol,
    coingeckoId: config?.nativeCurrency?.coingeckoId || knownEvmNetwork?.nativeCurrency.coingeckoId,
    logo: getTokenLogoUrl(
      config?.nativeCurrency?.logo ?? knownEvmNetwork?.nativeCurrency?.logo,
      config?.nativeCurrency?.coingeckoId ?? knownEvmNetwork?.nativeCurrency.coingeckoId,
      symbol,
    ),
    mirrorOf: config?.nativeCurrency?.mirrorOf || knownEvmNetwork?.nativeCurrency.mirrorOf,
  }

  const logo = getNetworkLogoUrl(
    config?.logo ?? knownEvmNetwork?.logo ?? dicIcons[knownEvmNetwork?.icon ?? ''],
    id,
    nativeCurrency,
  )

  if (id === '999') console.log({ config, knownEvmNetwork, viemChain })

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
    balancesConfig: config?.balancesConfig || knownEvmNetwork?.balancesConfig || undefined,

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
