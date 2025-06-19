import { execSync } from 'child_process'

import 'dotenv/config'

import { readFileSync } from 'fs'

import pkgBalances from '@talismn/balances/package.json'

export const BALANCES_LIB_VERSION = pkgBalances.version

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
// export const GITHUB_API = 'https://api.github.com/graphql' // bad boy, bad!
export const GITHUB_CDN = 'https://raw.githubusercontent.com'
export const GITHUB_ORG = 'TalismanSociety'
export const GITHUB_REPO = 'chaindata'

// yup, it was that easy :)
export const GITHUB_BRANCH = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()

export const DIR_ASSETS_CHAINS = 'assets/chains'
export const DIR_OUTPUT = 'pub/v4'

export const NOVASAMA_METADATA_PORTAL_CONFIG =
  'https://raw.githubusercontent.com/novasamatech/metadata-portal/master/config.toml'

export const FILE_INPUT_NETWORKS_POLKADOT = 'data/networks-polkadot.yaml'
export const FILE_INPUT_NETWORKS_ETHEREUM = 'data/networks-ethereum.yaml'
export const FILE_INPUT_KNOWN_NETWORKS_ETHEREUM_OVERRIDES = 'data/ethereum-known-networks-overrides.yaml'
export const FILE_INPUT_COINGECKO_OVERRIDES = 'data/coingecko-overrides.yaml'

export const FILE_OUTPUT_TOKENS_POLKADOT = DIR_OUTPUT + '/tokens-polkadot.json'
export const FILE_OUTPUT_TOKENS_ETHEREUM = DIR_OUTPUT + '/tokens-ethereum.json'
export const FILE_OUTPUT_TOKENS_ALL = DIR_OUTPUT + '/tokens.json'
export const FILE_OUTPUT_NETWORKS_POLKADOT = DIR_OUTPUT + '/networks-polkadot.json'
export const FILE_OUTPUT_NETWORKS_ETHEREUM = DIR_OUTPUT + '/networks-ethereum.json'
export const FILE_OUTPUT_NETWORKS_ALL = DIR_OUTPUT + '/networks.json'
export const FILE_OUTPUT_MINI_METADATAS = DIR_OUTPUT + '/mini-metadatas.json'
export const FILE_OUTPUT_CHAINDATA = DIR_OUTPUT + '/chaindata.json'
export const FILE_OUTPUT_CHAINDATA_MINIFIED = DIR_OUTPUT + '/chaindata.min.json'

export const FILE_RPC_HEALTH_WEBSOCKET = 'data/generated/rpc-health-websocket.json'
export const FILE_NETWORKS_SPECS_POLKADOT = 'data/cache/polkadot-network-specs.json'
export const FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT = 'data/cache/polkadot-metadata-extracts.json'
export const FILE_NOVASAMA_METADATA_PORTAL_URLS = 'data/cache/novasama-metadata-portal-urls.json'
export const FILE_KNOWN_EVM_NETWORKS = 'data/generated/known-evm-networks.json'
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
