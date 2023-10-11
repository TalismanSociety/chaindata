import 'dotenv/config'

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
export const GITHUB_API = 'https://api.github.com/graphql'
export const GITHUB_CDN = 'https://raw.githubusercontent.com'
export const GITHUB_ORG = 'TalismanSociety'
export const GITHUB_REPO = 'chaindata'
export const GITHUB_BRANCH = 'feat/known-evm-networks-and-tokens-2' // TODO main

export const DIR_ASSETS_CHAINS = 'assets/chains'
export const DIR_OUTPUT = 'dist'

export const FILE_CHAINDATA = 'chaindata.json'
export const FILE_TESTNETS_CHAINDATA = 'testnets-chaindata.json'
export const FILE_EVM_NETWORKS = 'evm-networks.json'
export const FILE_KNOWN_EVM_NETWORKS = 'known-evm-networks.json'
export const FILE_KNOWN_EVM_NETWORKS_OVERRIDES = 'known-evm-networks-overrides.json'

export const PROCESS_CONCURRENCY = 15
export const RPC_REQUEST_TIMEOUT = 20_000 // 20_000 ms = 20 seconds

export const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY ?? ''
export const COINGECKO_LOGO_DOWNLOAD_LIMIT = process.env.COINGECKO_API_KEY ? Number(process.env.COINGECKO_API_KEY) : 100
