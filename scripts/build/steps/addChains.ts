import { Chain, githubChainLogoUrl } from '@talismn/chaindata-provider'

import { sharedData } from './_sharedData'

export const addChains = async () => {
  // add chains (from the config) to the db
  for (const configChain of sharedData.chainsConfig) {
    if (typeof configChain?.id !== 'string') continue

    const chain: Partial<Chain> = { id: configChain.id }

    // set values
    chain.isTestnet = configChain.isTestnet || false
    chain.name = configChain.name ?? null
    chain.logo = githubChainLogoUrl(configChain.id) // TODO: Copy chain & token assets into GH Pages output
    chain.account = configChain.account
    chain.subscanUrl = configChain.subscanUrl
    chain.chainspecQrUrl = configChain.chainspecQrUrl
    chain.latestMetadataQrUrl = configChain.latestMetadataQrUrl
    chain.isUnknownFeeToken = configChain.isUnknownFeeToken || false
    chain.rpcs = (configChain.rpcs || []).map((url) => ({ url, isHealthy: true }))

    // only set relay and paraId if both exist on configChain
    // TODO: Figure out parachains automatically
    const hasRelay = Boolean(
      configChain.relay?.id && sharedData.chainsConfig.some((chain) => chain.id === configChain.relay!.id)
    )
    chain.paraId = hasRelay && configChain.paraId ? configChain.paraId : null
    chain.relay = hasRelay && configChain.paraId ? { id: configChain.relay!.id } : null

    if (!(chain as any).balancesMetadata)
      (chain as any).balancesMetadata = []

      //
    ;(chain as any).balancesConfig = Object.entries(configChain.balancesConfig ?? {}).map(
      ([moduleType, moduleConfig]) => ({ moduleType, moduleConfig })
    )

    // used to override the auto-calculated theme color
    if (typeof configChain.themeColor === 'string')
      sharedData.userDefinedThemeColors.chains.set(configChain.id, configChain.themeColor)

    // save
    sharedData.chains.push(chain as Chain)
  }
}
