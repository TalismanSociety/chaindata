import { Chain as UpstreamChain, githubChainLogoUrl } from '@talismn/chaindata-provider'

import { sharedData } from './_sharedData'

// TODO: Switch to the updated type in `@talismn/chaindata`
type Chain = Omit<UpstreamChain, 'balanceMetadata'> & {
  balancesConfig: Array<{ moduleType: string; moduleConfig: unknown }>
  balancesMetadata: Array<{ moduleType: string; metadata: unknown }>
}

export const addChains = async () => {
  // add chains (from the config) to the db
  for (const configChain of sharedData.chainsConfig) {
    if (typeof configChain?.id !== 'string') continue

    // only set relay and paraId if both exist on configChain
    // TODO: Figure out parachains automatically
    const hasRelay = Boolean(
      configChain.relay?.id && sharedData.chainsConfig.some((chain) => chain.id === configChain.relay!.id)
    )

    const chain: Chain = {
      id: configChain.id,

      // set values
      isTestnet: configChain.isTestnet || false,
      sortIndex: null,
      genesisHash: null,
      prefix: null,
      name: configChain.name ?? null,
      themeColor: null,
      logo: githubChainLogoUrl(configChain.id), // TODO: Copy chain & token assets into GH Pages output
      chainName: null,
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
      rpcs: (configChain.rpcs || []).map((url) => ({ url, isHealthy: true })),
      isHealthy: true,
      evmNetworks: [],

      parathreads: null,

      paraId: hasRelay && configChain.paraId ? configChain.paraId : null,
      relay: hasRelay && configChain.paraId ? { id: configChain.relay!.id } : null,

      balancesConfig: Object.entries(configChain.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
        moduleType,
        moduleConfig,
      })),
      balancesMetadata: [],
    }

    // used to override the auto-calculated theme color
    if (typeof configChain.themeColor === 'string')
      sharedData.userDefinedThemeColors.chains.set(configChain.id, configChain.themeColor)

    // save
    sharedData.chains.push(chain as unknown as UpstreamChain)
  }
}
