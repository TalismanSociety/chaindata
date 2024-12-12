import { PathLike } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { PromisePool } from '@supercharge/promise-pool'
import sharp from 'sharp'

import {
  COINGECKO_LOGO_DOWNLOAD_LIMIT,
  FILE_CHAINDATA,
  FILE_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS,
  FILE_KNOWN_EVM_NETWORKS_OVERRIDES,
  PROCESS_CONCURRENCY,
} from '../../shared/constants'
import { ConfigChain, ConfigEvmNetwork } from '../../shared/types'
import { fetchCoinDetails } from '../coingecko'

const INVALID_IMAGE_COINGECKO_IDS = [
  'baoeth-eth-stablepool',
  'baousd-lusd-stablepool',
  'bifinance-exchange',
  'cellframe',
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
  'aicore',
  'aventis-metaverse',
  'balancer-usdc-usdbc-axlusdc',
  'basepal',
  'bridged-binance-peg-ethereum-opbnb',
  'dollar-on-chain',
  'earntv',
  'gmlp',
  'gold-utility-token',
  'goofy-inu',
  'hermionegrangerclintonamberamyrose9inu',
  'horizon-protocol-zbnb',
  'hottel',
  'hygt',
  'karen-pepe',
  'larace',
  'rand',
  'strix',
  'sword-and-magic-world',
  'thunderhead-staked-flip',
  'titanx',
  'trumatic-matic-stable-pool',
  'wrapped-eeth',
  'zhaodavinci',
  'ivendpay',
  'metahub-finance',
  'polkaex',
  '3space-art',
  'bitstable-finance',
  'bridged-wrapped-ether-voltage-finance',
  'game-tournament-trophy',
  'grok-x-ai',
  'holy-spirit',
  'logic',
  'mantle-usd',
  'mini-grok',
  'wrapped-fuse',
  'fortunafi-tokenized-short-term-u-s-treasury-bills-for-non-us-residents',
  'patriot-pay',
  'vibingcattoken',
  'basic-dog-meme',
  'exactly-wbtc',
  '0xgasless-2',
  'osschain',
  'mevai',
  'grok-queen',
  'grok-queen',
  'whatbot',
  'barsik',
  'three-hundred-ai',
  'edge-matrix-computing',
  'balancer-80-rdnt-20-weth',
  'redlight-chain',
  'hoo-token',
  'jongro-boutique',
  'lexa-ai',
  'realvirm',
  'dragon-3',
  'ghost',
  'utility-nexusmind',
  'zora-bridged-weth-zora-network',
  'pnear',
  'multichain-bridged-busd-moonriver',
  'brightpool',
  'bridged-matic-manta-pacific',
  'multichain-bridged-busd-okt-chain',
  'polygon-bridged-busd-polygon',
  'nyan-cat-on-base',
  'seamans-token',
  'thundercore-bridged-busd-thundercore',
  'zebradao',
  'lua-balancing-token',
  'bridged-weeth-manta-pacific',
  'metastreet-v2-mwsteth-wpunks-20',
  'dexnet',
  'going-to-the-moon',
  'bridged-unieth-manta-pacific',
  'bridged-busd',
  'celer-bridged-busd-zksync',
  'harmony-horizen-bridged-busd-harmony',
  'blast-old',
  'proof-of-memes-pomchain',
  'bridged-usdc-x-layer',
  'humanity-protocol-dply',
  'dook',
  'iotex-bridged-busd-iotex',
  'butter-bridged-solvbtc-map-protocol',
  'frax-doge',
  'wienerai',
  'all-time-high-degen',
  'fefe',
  'brazilian-digital-token',
  'jur',
  'eurc',
  'hydration',
  'axelar-bridged-usdc',
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

  const allCoingeckoIds = getAllCoingeckoIds(chains, knownEvmNetworks, knownEvmNetworksOverrides, defaultEvmNetworks)
  const validCoingeckoIds = allCoingeckoIds.filter((coingeckoId) => !INVALID_IMAGE_COINGECKO_IDS.includes(coingeckoId))

  const logoFilepaths = new Map(
    validCoingeckoIds.map((coingeckoId) => [
      coingeckoId,
      path.resolve('./assets/tokens/coingecko', `${coingeckoId}.webp`),
    ]),
  )

  console.log('checking for missing logos')

  // expect each of these to have a logo in ./assets/tokens/known
  // download only if missing
  const missingLogoCoingeckoIds = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(logoFilepaths)
      .process(async ([coingeckoId, filepath]) => {
        try {
          if (await exists(filepath)) return
          return coingeckoId
        } catch (error) {
          console.error(`Failed to check if logo for coingeckoId ${coingeckoId} exists at filepath ${filepath}`)
        }
      })
  ).results.flatMap((coingeckoId) => coingeckoId ?? [])

  // max 100 per run to prevent github action timeout
  const fetchCoingeckoIds = missingLogoCoingeckoIds.slice(0, COINGECKO_LOGO_DOWNLOAD_LIMIT)

  console.log(`fetching logos for ${fetchCoingeckoIds.length} tokens`)

  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(fetchCoingeckoIds)
    .process(async (coingeckoId) => {
      try {
        const coin = await fetchCoinDetails(coingeckoId, { retryAfter60s: true })
        console.log('downloading icon for %s : %s', coin.id, coin.image.large)

        if (!coin.image.large.startsWith('https://')) return console.warn('missing image, skipping...')

        const responseImg = await fetch(coin.image.large)
        const responseBuffer = await responseImg.arrayBuffer()

        const img = sharp(responseBuffer)
        const { width, height } = await img.metadata()
        if (!width || !height || width > 256 || height > 256) img.resize(256, 256, { fit: 'contain' })

        const webpBuffer = await img.webp().toBuffer()
        await writeFile(logoFilepaths.get(coingeckoId)!, Buffer.from(webpBuffer))
      } catch (error) {
        console.log('Failed to download coingecko image for %s', coingeckoId, error)
      }
    })
}

const exists = (path: PathLike) =>
  stat(path).then(
    () => true,
    () => false,
  )
