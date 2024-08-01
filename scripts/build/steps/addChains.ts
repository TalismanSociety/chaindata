import { existsSync } from 'node:fs'

import { Chain } from '@talismn/chaindata-provider'

import { getAssetUrlFromPath, UNKNOWN_NETWORK_LOGO_URL } from '../../shared/util'
import { sharedData } from './_sharedData'

export const addChains = async () => {
  // add chains (from the config) to the db
  for (const configChain of sharedData.chainsConfig) {
    if (typeof configChain?.id !== 'string') continue

    // don't include chains with no RPCs
    if (!configChain.rpcs?.length) continue

    // only set relay and paraId if both exist on configChain
    // TODO: Figure out parachains automatically
    const hasRelay = Boolean(
      configChain.relay?.id && sharedData.chainsConfig.some((chain) => chain.id === configChain.relay!.id),
    )

    const chain: Chain = {
      id: configChain.id,

      // set values
      isTestnet: configChain.isTestnet || false,
      isDefault: configChain.isDefault ?? true,
      sortIndex: null,
      genesisHash: null,
      prefix: null,
      name: configChain.name ?? null,
      themeColor: null,
      logo: null,
      chainName: null,
      chainType: null,
      implName: null,
      specName: null,
      specVersion: null,
      nativeToken: null,
      tokens: [],
      account: configChain.account ?? null,
      subscanUrl: configChain.subscanUrl ?? null,
      chainspecQrUrl: configChain.chainspecQrUrl ?? null,
      latestMetadataQrUrl: configChain.latestMetadataQrUrl ?? null,
      isUnknownFeeToken: configChain.isUnknownFeeToken || false,
      feeToken: configChain.feeToken || null,
      rpcs: (configChain.rpcs || []).map((url) => ({ url })),
      evmNetworks: [],

      parathreads: null,

      paraId: hasRelay && configChain.paraId ? configChain.paraId : null,
      relay: hasRelay && configChain.paraId ? { id: configChain.relay!.id } : null,

      balancesConfig: Object.entries(configChain.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
        moduleType,
        moduleConfig,
      })),
      balancesMetadata: [],
      hasExtrinsicSignatureTypePrefix: configChain.hasExtrinsicSignatureTypePrefix,
    }

    if (!chain.logo) {
      const chainLogoUrl = `./assets/chains/${chain.id}.svg`
      if (existsSync(chainLogoUrl)) chain.logo = getAssetUrlFromPath(chainLogoUrl)
      else chain.logo = UNKNOWN_NETWORK_LOGO_URL
    }

    // used to override the auto-calculated theme color
    if (typeof configChain.themeColor === 'string')
      sharedData.userDefinedThemeColors.chains.set(configChain.id, configChain.themeColor)

    // save
    sharedData.chains.push(chain)
  }
}
