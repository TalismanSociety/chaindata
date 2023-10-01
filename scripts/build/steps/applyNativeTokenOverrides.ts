import { sharedData } from './_sharedData'

export const applyNativeTokenOverrides = async () => {
  const { chains } = sharedData

  for (const chain of chains) {
    const overrideNativeTokenId = sharedData.chainsConfig.find(({ id }) => id === chain.id)?.overrideNativeTokenId
    if (typeof overrideNativeTokenId !== 'string') continue

    chain.nativeToken = { id: overrideNativeTokenId }
  }
}
