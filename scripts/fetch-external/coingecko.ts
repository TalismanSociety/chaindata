import { COINGECKO_API_KEY } from '../shared/constants'
import { CoingeckoAssetPlatform, CoingeckoCoin, CoingeckoCoinDetails } from '../shared/types'

// docs mentions api key can be set in header, but if there is a query string then header are ignored
// => always specify api key in query string
const DEFAULT_URL_PARAMS = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : undefined

export const fetchAssetPlatforms = async () => {
  const urlParams = new URLSearchParams(DEFAULT_URL_PARAMS)

  const resAssetPlatforms = await fetch('https://api.coingecko.com/api/v3/asset_platforms?' + urlParams.toString())
  const assetPlatforms = (await resAssetPlatforms.json()) as CoingeckoAssetPlatform[]

  // // TODO for debugging only, remove when ready
  // await writeFile(
  //   'dist/assetPlatforms.json',
  //   await prettier.format(JSON.stringify(assetPlatforms, null, 2), {
  //     parser: 'json',
  //   }),
  // )

  return assetPlatforms
}

export const fetchCoins = async () => {
  const urlParams = new URLSearchParams(DEFAULT_URL_PARAMS)
  urlParams.set('include_platform', 'true')

  const resCoins = await fetch('https://api.coingecko.com/api/v3/coins/list?' + urlParams)
  const coins = (await resCoins.json()) as CoingeckoCoin[]

  // // TODO for debugging only, remove when ready
  // await writeFile(
  //   'dist/coins.json',
  //   await prettier.format(JSON.stringify(coins, null, 2), {
  //     parser: 'json',
  //   }),
  // )

  return coins
}

export const fetchCoinDetails = async (
  coingeckoId: string,
  { retryAfter60s }: { retryAfter60s?: boolean } = {},
): Promise<CoingeckoCoinDetails> => {
  const urlParams = new URLSearchParams(DEFAULT_URL_PARAMS)
  urlParams.set('localization', 'false')
  urlParams.set('market_data', 'false')
  urlParams.set('community_data', 'false')
  urlParams.set('developer_data', 'false')
  urlParams.set('sparkline', 'false')
  urlParams.set('tickers', 'false')

  const resCoins = await fetch(`https://api.coingecko.com/api/v3/coins/${coingeckoId}?${urlParams}`)

  if (resCoins.status === 429 && retryAfter60s) {
    const retryAfter = resCoins.headers.get('retry-after')
    const timeout = retryAfter ? parseInt(retryAfter) * 1000 : 60_000
    console.log('429 - Too many requests - waiting %d seconds', Math.round(timeout / 1000))
    await new Promise((resolve) => setTimeout(resolve, 60_000))
    return fetchCoinDetails(coingeckoId)
  }

  if (!resCoins.ok) throw new Error(resCoins.statusText)

  return (await resCoins.json()) as CoingeckoCoinDetails
}
