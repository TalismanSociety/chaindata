import { PathLike } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { PromisePool } from '@supercharge/promise-pool'
import uniq from 'lodash/uniq'
import sharp from 'sharp'

import { fetchCoinDetails } from '../../shared/coingecko'
import {
  COINGECKO_LOGO_DOWNLOAD_LIMIT,
  FILE_DOT_TOKENS_PREBUILD,
  FILE_ETH_TOKENS_PREBUILD,
  FILE_SOL_TOKENS_PREBUILD,
  PROCESS_CONCURRENCY,
} from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { EthTokensPreBuildFileSchema } from '../../shared/schemas/EthTokensPreBuild'
import { SolTokensPreBuildFileSchema } from '../../shared/schemas/SolTokensPreBuild'

const INVALID_IMAGE_COINGECKO_IDS = [
  'vibingcattoken',
  'baoeth-eth-stablepool',
  'goofy-inu',
  'fefe',
  'metastreet-v2-mwsteth-wpunks-20',
  'taxa-token',
  'thunderhead-staked-flip',
  'yieldeth-sommelier',
  'bridged-busd',
  'multichain-bridged-busd-moonriver',
  'harmony-horizen-bridged-busd-harmony',
  'seamans-token',
  'bridged-matic-manta-pacific',
  'exactly-wbtc',
  'bridged-binance-peg-ethereum-opbnb',
  'celer-bridged-busd-zksync',
  'balancer-80-rdnt-20-weth',
  'pacman-native-token',
  'mantle-usd',
  'dungeon-token',
  'going-to-the-moon',
  'realvirm',
  'grok-queen',
  'utility-nexusmind',
  'iotex-bridged-busd-iotex',
  'sword-and-magic-world',
  'all-time-high-degen',
  'fortunafi-tokenized-short-term-u-s-treasury-bills-for-non-us-residents',
  'zora-bridged-weth-zora-network',
  'tapio-protocol',
  'axelar-bridged-usdc',
  'liquid-crowdloan-dot',
  'acala-dollar',
  'neutron',
  'taiga',
  'hydration',
  'brazilian-digital-token',
  'polkaex',
  'composable-finance-layr',
  'darwinia-crab-network',
  'eurc',
  '-8',
  '-9',
  'blai',
  'basetard',
  'bitball-2',
  'america-party-4',
  'tinkernet',
  'doll-fantasy-token',
  'redlight-chain',
  'hoo-token',
  'empire-capital-token',
  'proof-of-memes-pomchain',
  'rice-2',
  'moo',
  'nostalgia',
  'clippy',
  'war-of-meme',
  'nutflex',
  'gnom',
  'pepe-sora-ai',
  'solanapepe',
  'pepetopia',
  'moonke',
  'paje-etdev-company',
  'bonk-of-america',
  'bios-2',
  'mr-beast-dog',
  'myre-the-dog',
  '-7',
  'lantern-staked-sol',
]

export const fetchCoingeckoTokensLogos = async () => {
  const dotTokens = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const ethTokens = parseJsonFile(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)
  const solTokens = parseJsonFile(FILE_SOL_TOKENS_PREBUILD, SolTokensPreBuildFileSchema)

  const allCoingeckoIds = uniq([
    ...dotTokens.map((token) => token.coingeckoId).filter((id): id is string => !!id),
    ...ethTokens.map((token) => token.coingeckoId).filter((id): id is string => !!id),
    ...solTokens.map((token) => token.coingeckoId).filter((id): id is string => !!id),
  ])

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

  const newInvalidCoingeckoIds: string[] = []

  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(fetchCoingeckoIds)
    .process(async (coingeckoId) => {
      try {
        const coin = await fetchCoinDetails(coingeckoId, { retryAfter60s: true })
        console.log('downloading icon for %s : %s', coin.id, coin.image.large)

        if (!coin.image.large.startsWith('https://')) {
          newInvalidCoingeckoIds.push(coingeckoId)
          return console.warn('missing image, skipping...')
        }

        const responseImg = await fetch(coin.image.large)
        const responseBuffer = await responseImg.arrayBuffer()

        const img = sharp(responseBuffer)
        const { width, height } = await img.metadata()
        if (!width || !height || width > 256 || height > 256) img.resize(256, 256, { fit: 'contain' })

        const webpBuffer = await img.webp().toBuffer()
        // @ts-ignore-next-line
        await writeFile(logoFilepaths.get(coingeckoId)!, Buffer.from(webpBuffer))
      } catch (error) {
        console.log('Failed to download coingecko image for %s', coingeckoId, error)
        newInvalidCoingeckoIds.push(coingeckoId)
      }
    })

  if (newInvalidCoingeckoIds.length) {
    console.warn('The following Coingecko IDs were invalid or had no image:')
    console.log(newInvalidCoingeckoIds)
    console.warn('Please add them to the INVALID_IMAGE_COINGECKO_IDS array in fetchCoingeckoTokensLogos.ts')
  }
}

const exists = (path: PathLike) =>
  stat(path).then(
    () => true,
    () => false,
  )
