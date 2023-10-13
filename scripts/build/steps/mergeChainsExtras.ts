import { readFile } from 'node:fs/promises'

import { FILE_CHAINS_EXTRAS_CACHE } from '../../shared/constants'
import { ChainExtrasCache } from '../../shared/types'
import { sharedData } from './_sharedData'

export const mergeChainsExtras = async () => {
  const chainsExtrasCache = JSON.parse(await readFile(FILE_CHAINS_EXTRAS_CACHE, 'utf-8')) as ChainExtrasCache[]

  for (const chain of sharedData.chains) {
    const extras = chainsExtrasCache.find((cc) => cc.id === chain.id)
    if (extras) Object.assign(chain, extras)
  }
}
