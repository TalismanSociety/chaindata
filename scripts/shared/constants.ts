import 'dotenv/config'

import { readFileSync } from 'fs'

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
export const GITHUB_API = 'https://api.github.com/graphql'
export const GITHUB_CDN = 'https://raw.githubusercontent.com'
export const GITHUB_ORG = 'TalismanSociety'
export const GITHUB_REPO = 'chaindata'
export const GITHUB_BRANCH = 'main'

export const DIR_ASSETS_CHAINS = 'assets/chains'
export const DIR_OUTPUT = 'pub/v2'

export const NOVASAMA_METADATA_PORTAL_CONFIG =
  'https://raw.githubusercontent.com/novasamatech/metadata-portal/master/config.toml'

export const FILE_CHAINDATA = 'data/chaindata.json'
export const FILE_TESTNETS_CHAINDATA = 'data/testnets-chaindata.json'
export const FILE_CHAINS_EXTRAS_CACHE = 'data/cache/chains-extras-cache.json'
export const FILE_NOVASAMA_METADATA_PORTAL_URLS = 'data/cache/novasama-metadata-portal-urls.json'

export const FILE_DEAD_CHAINS = 'data/cache/dead-chains.json'

export const FILE_EVM_NETWORKS = 'data/evm-networks.json'
export const FILE_KNOWN_EVM_NETWORKS = 'data/generated/known-evm-networks.json'
export const FILE_KNOWN_EVM_NETWORKS_OVERRIDES = 'data/known-evm-networks-overrides.json'
export const FILE_KNOWN_EVM_ERC20_TOKENS_CACHE = 'data/cache/known-evm-erc20-tokens-cache.json'
export const FILE_KNOWN_EVM_UNISWAPV2_TOKENS_CACHE = 'data/cache/known-evm-uniswapv2-tokens-cache.json'
export const FILE_KNOWN_EVM_NETWORKS_ICONS_CACHE = 'data/cache/known-evm-networks-icons-cache.json'
export const FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE = 'data/cache/known-evm-networks-rpcs-cache.json'

export const PROCESS_CONCURRENCY = 15
export const RPC_REQUEST_TIMEOUT = 20_000 // 20_000 ms = 20 seconds

const coingeckoApiUrlString = process.env.COINGECKO_API_URL // can be an empty string, if .env key is set but value is not set
export const COINGECKO_API_URL =
  coingeckoApiUrlString && coingeckoApiUrlString.length > 0 ? coingeckoApiUrlString : 'http://api.coingecko.com'
export const COINGECKO_API_KEY_NAME = process.env.COINGECKO_API_KEY_NAME
export const COINGECKO_API_KEY_VALUE = process.env.COINGECKO_API_KEY_VALUE
export const COINGECKO_LOGO_DOWNLOAD_LIMIT = process.env.COINGECKO_LOGO_DOWNLOAD_LIMIT
  ? Number(process.env.COINGECKO_LOGO_DOWNLOAD_LIMIT)
  : 100

export const PRETTIER_CONFIG = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), { encoding: 'utf8' }),
).prettier
