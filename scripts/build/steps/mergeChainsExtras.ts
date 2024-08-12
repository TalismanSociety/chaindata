import { readFile } from 'node:fs/promises'

import { FILE_CHAINS_EXTRAS_CACHE } from '../../shared/constants'
import { ChainExtrasCache } from '../../shared/types'
import { sharedData } from './_sharedData'

export const mergeChainsExtras = async () => {
  const chainsExtrasCache: ChainExtrasCache[] = JSON.parse(await readFile(FILE_CHAINS_EXTRAS_CACHE, 'utf-8'))

  for (const chain of sharedData.chains) {
    const { cacheBalancesConfigHash, miniMetadatas, tokens, ...extras } =
      chainsExtrasCache.find((cc) => cc.id === chain.id) ?? {}

    if (extras) {
      // override hasCheckMetadataHash only if it's not set on the chain, we need to be able to force that value and ignore the cache
      const hasCheckMetadataHash = chain.hasCheckMetadataHash
      Object.assign(chain, extras)
      if (hasCheckMetadataHash !== undefined) chain.hasCheckMetadataHash = hasCheckMetadataHash // force the manual value
    }
    if (miniMetadatas) sharedData.miniMetadatas.push(...Object.values(miniMetadatas))
    if (tokens) {
      sharedData.tokens.push(...Object.values(tokens))
      if (!chain.tokens) chain.tokens = []
      chain.tokens?.push(...Object.values(tokens).map(({ id }) => ({ id })))

      if (!chain.nativeToken) {
        const nativeToken = Object.values(tokens).find((token) => token.type === 'substrate-native')
        if (nativeToken) chain.nativeToken = { id: nativeToken.id }
      }
    }
  }
}
