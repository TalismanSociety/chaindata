import { Chain, githubChainLogoUrl } from '@talismn/chaindata-provider'

import { sharedData } from './_sharedData'

export const addChains = async () => {
  // add chains (from the config) to the db
  for (const configChain of sharedData.chainsConfig) {
    if (typeof configChain?.id !== 'string') continue

    const chain: Partial<Chain> = { id: configChain.id }

    // const chain = await getOrCreate(store, Chain, configChain.id)
    // const relay = configChain.relay?.id ? await store.findOne(Chain, { where: { id: configChain.relay.id } }) : null

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
    if (!chain.balanceMetadata)
      chain.balanceMetadata = []

      // TODO: Add this back again
      // only set relay and paraId if both exist on configChain
      // TODO: Figure out parachains automatically
      // chain.paraId = relay !== null && configChain.paraId ? configChain.paraId : null
      // chain.relay = relay !== null && configChain.paraId ? relay : null

      //
    ;(chain as any).balanceModuleConfigs = Object.entries(configChain.balanceModuleConfigs ?? {}).map(
      ([moduleType, moduleConfig]) => ({ moduleType, moduleConfig })
    )

    // used to override the auto-calculated theme color
    if (typeof configChain.themeColor === 'string')
      sharedData.userDefinedThemeColors.chains.set(configChain.id, configChain.themeColor)

    // save
    sharedData.chains.push(chain as Chain)
  }
}
