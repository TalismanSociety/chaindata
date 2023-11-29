import fs from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  COINGECKO_LOGO_DOWNLOAD_LIMIT,
  FILE_CHAINDATA,
  FILE_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS_OVERRIDES,
} from '../../shared/constants'
import { ConfigChain, ConfigEvmNetwork } from '../../shared/types'
import { fetchCoinDetails } from '../coingecko'

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
  'tapio-protocol',
  'liquid-crowdloan-dot',
  'acala-dollar',
  'bit',
  'composable-finance-layr',
  'darwinia-crab-network',
  'imbue-network',
  'taiga',
  'neutron',
  'subgame',
  "aicore",
  "aventis-metaverse",
  "balancer-usdc-usdbc-axlusdc",
  "basepal",
  "bridged-binance-peg-ethereum-opbnb",
  "dollar-on-chain",
  "earntv",
  "gmlp",
  "gold-utility-token",
  "goofy-inu",
  "hermionegrangerclintonamberamyrose9inu",
  "horizon-protocol-zbnb",
  "hottel",
  "hygt",
  "karen-pepe",
  "larace",
  "rand",
  "strix",
  "sword-and-magic-world",
  "thunderhead-staked-flip",
  "titanx",
  "trumatic-matic-stable-pool",
  "wrapped-eeth",
  "zhaodavinci",
]

type BalanceModuleConfig = {
  coingeckoId?: string
  tokens?: { coingeckoId?: string }[]
}

const getAllCoingeckoIds = (
  chains: ConfigChain[],
  knownEvmNetworks: ConfigEvmNetwork[],
  knownEvmNetworksOverrides: ConfigEvmNetwork[],
  defaultEvmNetworks: ConfigEvmNetwork[],
) => {
  const coingeckoIds = new Set<string>()

  for (const chain of [...chains, ...knownEvmNetworks, ...knownEvmNetworksOverrides, ...defaultEvmNetworks]) {
    if (!chain.balancesConfig) continue

    for (const moduleKey in chain.balancesConfig) {
      const moduleConfig = chain.balancesConfig[moduleKey] as BalanceModuleConfig
      if (moduleConfig.coingeckoId) coingeckoIds.add(moduleConfig.coingeckoId)
      if (moduleConfig.tokens)
        for (const token of moduleConfig.tokens) if (token.coingeckoId) coingeckoIds.add(token.coingeckoId)
    }
  }

  return [...coingeckoIds].sort()
}

export const fetchCoingeckoTokensLogos = async () => {
  const defaultEvmNetworks = JSON.parse(await readFile(FILE_EVM_NETWORKS, 'utf-8')) as ConfigEvmNetwork[]
  const knownEvmNetworks = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8')) as ConfigEvmNetwork[]
  const knownEvmNetworksOverrides = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_OVERRIDES, 'utf-8'),
  ) as ConfigEvmNetwork[]
  const chains = JSON.parse(await readFile(FILE_CHAINDATA, 'utf-8')) as ConfigChain[]

  const coingeckoIds = getAllCoingeckoIds(chains, knownEvmNetworks, knownEvmNetworksOverrides, defaultEvmNetworks)

  let downloads = 0

  // expect each of these to have a logo in ./assets/tokens/known
  // download only if missing
  for (const coingeckoId of coingeckoIds) {
    // max 100 per run to prevent github action timeout
    if (downloads > COINGECKO_LOGO_DOWNLOAD_LIMIT) break

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
      let buffer:any = await responseImg.arrayBuffer()

      const img = sharp(buffer)
      const { width, height } = await img.metadata()
      if (!width || !height || width > 256 || height > 256) img.resize(256, 256, { fit: 'contain' })
      buffer = await img.webp().toBuffer()

      await writeFile(filepathWebp, Buffer.from(buffer))
    } catch (err) {
      console.log('Failed to download coingecko image for %s', coingeckoId, err)
    }

    downloads++
  }
}
