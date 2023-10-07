import fs from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import prettier from 'prettier'
import sharp from 'sharp'

import { fetchCoinDetails } from '../coingecko'
import { TalismanEvmNetwork } from '../types'

const INVALID_IMAGE_COINGECKO_IDS = [
  'baoeth-eth-stablepool',
  'baousd-lusd-stablepool',
  'bifinance-exchange',
  'cellframe',
  'diva-staking',
  'epiko',
  'fake-market-cap',
  'fight-out',
  'future-t-i-m-e-dividend',
  'g',
  'hiveterminal',
  'nobi',
  'style-protocol',
  'taxa-token',
  'the-real-calcium',
  'vmpx-erc20',
  'yieldeth-sommelier',
  'baby-yooshiape',
  'bovineverse-bvt',
  'crypto-news-flash-ai',
  'dungeon-token',
  'football-at-alphaverse',
  'helper-coin',
  'pink-vote',
  'rambox',
  'to-the-moon-token',
  'wagmi-token',
  'heco-peg-bnb',
  'heco-peg-xrp',
  'pacman-native-token',
  'firepot-finance',
  'bridged-sommelier-axelar',
  'adv3nture-xyz-gemstone',
]

const getAllCoingeckoIds = (knownEvmNetworks: TalismanEvmNetwork[]) => {
  const coingeckoIds = new Set<string>()

  for (const evmNetwork of knownEvmNetworks) {
    if (evmNetwork.balancesConfig?.['evm-native']?.coingeckoId)
      coingeckoIds.add(evmNetwork.balancesConfig['evm-native'].coingeckoId)
    for (const token of evmNetwork.balancesConfig?.['evm-erc20']?.tokens ?? [])
      if (token.coingeckoId) coingeckoIds.add(token.coingeckoId)
  }

  return [...coingeckoIds]
}

export const fetchKnownEvmTokensLogos = async () => {
  const knownEvmNetworks = JSON.parse(await readFile('known-evm-networks.json', 'utf-8')) as TalismanEvmNetwork[]

  const coingeckoIds = getAllCoingeckoIds(knownEvmNetworks)

  // expect each of these to have a logo in ./assets/tokens/known
  // download only if missing
  for (const coingeckoId of coingeckoIds) {
    if (INVALID_IMAGE_COINGECKO_IDS.includes(coingeckoId)) continue

    try {
      const filepathWebp = path.resolve('./assets/tokens/coingecko', `${coingeckoId}.webp`)

      if (fs.existsSync(filepathWebp)) continue

      const coin = await fetchCoinDetails(coingeckoId, true)
      console.log('downloading icon for %s : %s', coin.id, coin.image.large)

      if (!coin.image.large.startsWith('https://')) {
        console.warn('missing image, skipping...', coin.image)
        continue
      }

      const responseImg = await fetch(coin.image.large)
      let buffer = await responseImg.arrayBuffer()

      const img = sharp(buffer)
      const { width, height, format } = await img.metadata()
      if (!width || !height || width > 256 || height > 256) img.resize(256, 256, { fit: 'contain' })
      buffer = await img.webp().toBuffer()

      await writeFile(filepathWebp, Buffer.from(buffer))
    } catch (err) {
      console.log('Failed to download coingecko image for %s', coingeckoId, err)
    }
  }
}
