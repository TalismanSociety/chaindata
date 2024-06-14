import merge from 'lodash/merge'
import urlJoin from 'url-join'

import { COINGECKO_API_KEY_NAME, COINGECKO_API_KEY_VALUE, COINGECKO_API_URL } from './constants'

export const fetchFromCoingecko = async (relativeUrl: string, init: RequestInit = {}) => {
  if (!COINGECKO_API_KEY_VALUE) console.warn('COINGECKO_API_KEY_VALUE is not set')

  const headers =
    COINGECKO_API_KEY_NAME && COINGECKO_API_KEY_VALUE
      ? {
          [COINGECKO_API_KEY_NAME.replaceAll('_', '-')]: COINGECKO_API_KEY_VALUE,
        }
      : {}
  const enhancedInit = merge(init, { headers })
  return fetch(urlJoin(COINGECKO_API_URL, relativeUrl), enhancedInit)
}
