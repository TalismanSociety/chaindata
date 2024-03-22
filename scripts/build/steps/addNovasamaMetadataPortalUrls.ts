import { readFile } from 'node:fs/promises'

import { FILE_NOVASAMA_METADATA_PORTAL_URLS } from '../../shared/constants'
import { MetadataPortalUrls } from '../../shared/types'
import { sharedData } from './_sharedData'

export const addNovasamaMetadataPortalUrls = async () => {
  const portalUrls: MetadataPortalUrls = JSON.parse(await readFile(FILE_NOVASAMA_METADATA_PORTAL_URLS, 'utf-8'))

  // prepare to remove existing novasama urls
  const chainsToDeleteMetadataUrls = new Map(
    sharedData.chains.flatMap((chain) => {
      if (!chain.chainspecQrUrl?.startsWith?.('https://metadata.novasama.io')) return []
      if (!chain.latestMetadataQrUrl?.startsWith?.('https://metadata.novasama.io')) return []

      return [[chain.id, chain]]
    }),
  )

  // add latest novasama urls
  for (const portalUrl of portalUrls) {
    const chain = sharedData.chains.find(
      (chain) => chain.id === portalUrl.id && chain.isTestnet === portalUrl.isTestnet,
    )
    if (!chain) {
      console.warn(
        `Unable to find chaindata chain for novasama metadata urls with id ${portalUrl.id} (${portalUrl.meta.title})${
          portalUrl.isTestnet ? ' (testnet)' : ''
        }`,
      )
      continue
    }

    if (chain.chainspecQrUrl?.startsWith?.('https://metadata.parity.io')) continue
    if (chain.latestMetadataQrUrl?.startsWith?.('https://metadata.parity.io')) continue

    chain.chainspecQrUrl = portalUrl.urls.chainspecQrUrl
    chain.latestMetadataQrUrl = portalUrl.urls.latestMetadataQrUrl

    chainsToDeleteMetadataUrls.delete(chain.id)
  }

  // remove invalid existing novasama urls
  for (const chain of chainsToDeleteMetadataUrls.values()) {
    delete (chain as any).chainspecQrUrl
    delete (chain as any).latestMetadataQrUrl
  }
}
