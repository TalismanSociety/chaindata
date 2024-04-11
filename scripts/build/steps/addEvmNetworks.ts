import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { PromisePool } from '@supercharge/promise-pool'
import type { EvmErc20Token, EvmNativeModuleConfig, EvmNativeToken } from '@talismn/balances'
import { EvmNetwork } from '@talismn/chaindata-provider'
import mergeWith from 'lodash/mergeWith'

import { FILE_KNOWN_EVM_TOKENS_CACHE, PROCESS_CONCURRENCY } from '../../shared/constants'
import { ConfigEvmNetwork, Erc20TokenCache } from '../../shared/types'
import { UNKNOWN_NETWORK_LOGO_URL, getAssetUrlFromPath, networkMergeCustomizer } from '../../shared/util'
import { sharedData } from './_sharedData'

export const addEvmNetworks = async () => {
  const isStandaloneEvmNetwork = (evmNetwork: EvmNetwork | ConfigEvmNetwork) =>
    'substrateChain' in evmNetwork
      ? typeof evmNetwork.substrateChain?.id !== 'string'
      : typeof evmNetwork.substrateChainId === 'undefined' && typeof evmNetwork.name !== 'undefined'

  const isSubstrateEvmNetwork = (evmNetwork: EvmNetwork | ConfigEvmNetwork) =>
    'substrateChain' in evmNetwork
      ? typeof evmNetwork.substrateChain?.id === 'string'
      : typeof evmNetwork.substrateChainId !== 'undefined'

  const tokensCache: Erc20TokenCache[] = JSON.parse(await readFile(FILE_KNOWN_EVM_TOKENS_CACHE, 'utf-8'))

  // we don't know most evm network ids until the second step where we look it up on-chain
  //
  // so, this map lets us associate the networks inside `standaloneEvmNetworks`, `substrateEvmNetworks`
  // and `allEvmNetworks` with their related configs in `evmNetworksConfig`
  //
  // this is needed so that we can extract the user-defined theme-color from the github config for each
  // network and associate it with the computed network id for use in other processor steps
  // (namely the addThemeColors step)
  //
  // it uses indexes into these arrays as temporary ids
  //
  // format:
  // {
  //   standalone: Map<array item index inside standaloneEvmNetworks, array item index inside githubEvmNetworks>,
  //   substrate: Map<array item index inside substrateEvmNetworks, array item index inside githubEvmNetworks>,
  //   all: Map<array item index inside allEvmNetworks, array item index inside githubEvmNetworks>,
  // }
  const configsByIndex = {
    standalone: new Map<number, number>(),
    substrate: new Map<number, number>(),
    all: new Map<number, number>(),
  }

  let substrateIndex = -1

  let allEvmNetworks = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(sharedData.evmNetworksConfig)
      .process(async (configEvmNetwork, configIndex) => {
        if (isSubstrateEvmNetwork(configEvmNetwork)) {
          substrateIndex++
          configsByIndex.substrate.set(substrateIndex, configIndex)
        }

        const substrateChain = sharedData.chains.find((chain) => chain.id === configEvmNetwork.substrateChainId)
        const substrateConfig = sharedData.chainsConfig.find((chain) => chain.id === configEvmNetwork.substrateChainId)

        // mark all ERC20 tokens with isDefault true
        if (configEvmNetwork?.balancesConfig?.['evm-erc20']?.tokens) {
          for (const token of configEvmNetwork.balancesConfig['evm-erc20'].tokens as EvmErc20Token[]) {
            token.isDefault = true

            // fill in missing token info from cache
            const tokenInfo = tokensCache.find(
              (ti) =>
                ti.chainId === Number(configEvmNetwork.id) &&
                ti.contractAddress.toLowerCase() === token.contractAddress.toLowerCase(),
            )
            if (tokenInfo) {
              if (!token.symbol) token.symbol = tokenInfo.symbol
              if (!token.decimals) token.decimals = tokenInfo.decimals
            }
          }
        }

        const evmNetwork: EvmNetwork = {
          id: configEvmNetwork.id,
          isTestnet: substrateChain?.isTestnet || substrateConfig?.isTestnet || configEvmNetwork.isTestnet || false,
          sortIndex: null,
          name: configEvmNetwork.name ?? substrateChain?.name ?? substrateConfig?.name ?? null,
          themeColor: configEvmNetwork.themeColor ?? substrateChain?.themeColor ?? substrateChain?.themeColor ?? null,
          logo: substrateChain?.logo ?? configEvmNetwork.logo ?? null, // TODO: Copy chain & token assets into pub output
          nativeToken: null,
          tokens: [],
          explorerUrl: configEvmNetwork.explorerUrl ?? null,
          rpcs: (configEvmNetwork.rpcs || []).map((url) => ({ url })),
          substrateChain: substrateChain ? { id: substrateChain.id } : null,

          balancesConfig: Object.entries(configEvmNetwork.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
            moduleType,
            moduleConfig,
          })),
          balancesMetadata: [],
          isDefault: configEvmNetwork.isDefault ?? true, // if not specified, it's default
        }

        return evmNetwork
      })
  ).results.filter((network): network is EvmNetwork => network !== undefined)

  // merge known evm network overrides
  const knownEvmNetworks = sharedData.knownEvmNetworksConfig.map((knownEvmNetwork) => {
    const overrides = sharedData.knownEvmNetworksOverridesConfig.find((ov) => ov.id === knownEvmNetwork.id)
    return overrides ? mergeWith(knownEvmNetwork, overrides, networkMergeCustomizer) : knownEvmNetwork
  })

  for (const knownEvmNetwork of knownEvmNetworks) {
    // mark all ERC20 tokens with isDefault false
    if (knownEvmNetwork?.balancesConfig?.['evm-erc20']?.tokens) {
      for (const token of knownEvmNetwork.balancesConfig['evm-erc20'].tokens as EvmErc20Token[]) {
        token.isDefault = false
      }
    }

    // update tokens (don't override default values, only fill what's missing)
    const existingNetwork = allEvmNetworks.find((n) => n.id === knownEvmNetwork.id)
    if (existingNetwork) {
      if (knownEvmNetwork?.balancesConfig?.['evm-erc20']?.tokens)
        for (const knownToken of knownEvmNetwork.balancesConfig['evm-erc20'].tokens as EvmErc20Token[]) {
          // create erc20 module if missing
          if (!existingNetwork.balancesConfig.some((c) => c.moduleType === 'evm-erc20')) {
            existingNetwork.balancesConfig.push({
              moduleType: 'evm-erc20',
              moduleConfig: {
                tokens: [],
              },
            })
          }
          const erc20Module = existingNetwork.balancesConfig.find((c) => c.moduleType === 'evm-erc20')
          const erc20ModuleConfig = erc20Module?.moduleConfig as { tokens: EvmErc20Token[] }

          const existingToken = erc20ModuleConfig.tokens.find(
            (t) => t.contractAddress.toLocaleLowerCase() === knownToken.contractAddress.toLowerCase(),
          )
          if (existingToken) {
            updateToken(existingToken, knownToken)
          } else {
            erc20ModuleConfig.tokens.push(knownToken)
          }
        }

      const knownNativeToken = knownEvmNetwork?.balancesConfig?.['evm-native']
      if (knownNativeToken) {
        // create native module if missing
        const hasNativeModuleConfig = existingNetwork.balancesConfig.some(({ moduleType: t }) => t === 'evm-native')
        if (!hasNativeModuleConfig) existingNetwork.balancesConfig.push({ moduleType: 'evm-native', moduleConfig: {} })

        const nativeModule = existingNetwork.balancesConfig.find(({ moduleType: t }) => t === 'evm-native')
        const nativeModuleConfig = nativeModule?.moduleConfig as EvmNativeModuleConfig
        updateToken(nativeModuleConfig, knownNativeToken)
      }

      // skip the rest of the processing for this network
      continue
    }

    const evmNetwork: EvmNetwork = {
      id: knownEvmNetwork.id,
      isTestnet: knownEvmNetwork.isTestnet ?? false,
      sortIndex: null,
      name: knownEvmNetwork.name ?? null,
      themeColor: null,
      logo: null,
      nativeToken: null,
      tokens: [],
      explorerUrl: knownEvmNetwork.explorerUrl ?? null,
      rpcs: (knownEvmNetwork.rpcs || []).map((url) => ({ url })),
      substrateChain: null,

      balancesConfig: Object.entries(knownEvmNetwork.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
        moduleType,
        moduleConfig,
      })),
      balancesMetadata: [],
      isDefault: false,
    }

    if (!evmNetwork.logo && knownEvmNetwork.icon) {
      const svgRelativePath = `./assets/chains/known/${knownEvmNetwork.icon}.svg`
      const webpRelativePath = `./assets/chains/known/${knownEvmNetwork.icon}.webp`
      if (existsSync(svgRelativePath)) evmNetwork.logo = getAssetUrlFromPath(svgRelativePath)
      else if (existsSync(webpRelativePath)) evmNetwork.logo = getAssetUrlFromPath(webpRelativePath)
    }

    allEvmNetworks.push(evmNetwork)
  }

  // default logos
  for (const network of allEvmNetworks) {
    if (!network.logo) {
      const chainLogoPath = `./assets/chains/${network.id}.svg`
      if (existsSync(chainLogoPath)) network.logo = getAssetUrlFromPath(chainLogoPath)
      else network.logo = UNKNOWN_NETWORK_LOGO_URL
    }
  }

  for (const [standaloneIndex, configIndex] of configsByIndex.standalone.entries()) {
    const allIndex = standaloneIndex
    configsByIndex.all.set(allIndex, configIndex)
  }
  for (const [substrateIndex, configIndex] of configsByIndex.substrate.entries()) {
    const allIndex = substrateIndex + configsByIndex.substrate.size
    configsByIndex.all.set(allIndex, configIndex)
  }

  // TODO : understand what's remaining in this block
  allEvmNetworks = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(allEvmNetworks)
      .process(async (evmNetwork, allIndex) => {
        // set the user-defined theme color (if it exists)
        // used to override the auto-calculated theme color
        const configEvmNetworkIndex = configsByIndex.all.get(allIndex)
        const configEvmNetwork =
          typeof configEvmNetworkIndex === 'number' ? sharedData.evmNetworksConfig[configEvmNetworkIndex] : undefined
        if (typeof configEvmNetwork?.themeColor === 'string')
          sharedData.userDefinedThemeColors.evmNetworks.set(evmNetwork.id, configEvmNetwork.themeColor)

        return evmNetwork
      })
  ).results.filter(<T>(evmNetwork: T): evmNetwork is NonNullable<T> => !!evmNetwork)

  sharedData.evmNetworks.push(...allEvmNetworks)
}

type UpdateTokenProps = Pick<
  Partial<EvmNativeToken | EvmErc20Token>,
  'coingeckoId' | 'symbol' | 'decimals' | 'dcentName'
>

/**
 * Sets any missing values of `defaultToken` to the values contained in `knownToken`.
 */
const updateToken = (defaultToken: UpdateTokenProps, knownToken: UpdateTokenProps) => {
  if (defaultToken?.coingeckoId === undefined && knownToken.coingeckoId)
    defaultToken.coingeckoId = knownToken.coingeckoId
  if (defaultToken?.symbol === undefined && knownToken.symbol) defaultToken.symbol = knownToken.symbol
  if (defaultToken?.decimals === undefined && knownToken.decimals !== undefined)
    defaultToken.decimals = knownToken.decimals
  if (defaultToken?.dcentName === undefined && knownToken.dcentName !== undefined)
    defaultToken.dcentName = knownToken.dcentName
}
