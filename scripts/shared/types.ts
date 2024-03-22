import type { EvmErc20ModuleConfig, EvmNativeModuleConfig, MiniMetadata } from '@talismn/balances'
import { Chain, Token } from '@talismn/chaindata-provider'

export type ChainId = string
export type EvmNetworkId = string

/** Represents a Chain from `chaindata.json` or `testnets-chaindata.json` */
export type ConfigChain = {
  id: string
  isTestnet?: boolean
  isDefault?: boolean
  name?: string
  themeColor?: string
  account?: string
  subscanUrl?: string
  chainspecQrUrl?: string
  latestMetadataQrUrl?: string
  overrideNativeTokenId?: string
  isUnknownFeeToken?: boolean
  feeToken?: string
  rpcs?: string[]
  paraId?: number
  relay?: { id: string }
  balancesConfig?: Record<string, Record<string, unknown>>
}

/** Represents an EvmNetwork from `evm-networks.json` */
export type ConfigEvmNetwork = {
  id: string
  substrateChainId?: string
  name?: string
  logo?: string
  isDefault?: boolean
  themeColor?: string
  isTestnet?: boolean
  explorerUrl?: string
  rpcs?: string[]
  balancesConfig?: Record<string, Record<string, unknown>> & {
    'evm-native'?: EvmNativeModuleConfig
    'evm-erc20'?: EvmErc20ModuleConfig
  }
  icon?: string
}

export type ChainExtrasCache = {
  // These are all copied directly into each chain
  id: string
  genesisHash: string
  prefix: number
  chainName: string
  chainType: Chain['chainType']
  implName: string
  specName: string
  specVersion: string
  cacheBalancesConfigHash: string

  // These are separated into their own build files, `tokens/all.json` and `miniMetadatas/all.json`
  miniMetadatas: Record<string, MiniMetadata>
  tokens: Record<string, Token>
}

export type MetadataPortalUrls = Array<{
  id: string
  isTestnet: boolean
  meta: {
    name: string
    title: string
  }
  urls: {
    chainspecQrUrl: string
    latestMetadataQrUrl: string
  }
}>

export type EvmNetworkRpcStatus = 'unknown' | 'valid' | 'invalid'

export type EvmNetworkRpcCache = {
  chainId: string
  rpcUrl: string
  status: EvmNetworkRpcStatus
  timestamp: number
}

export type EthereumListsChain = {
  name: string
  chainId: number
  shortName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpc: Array<string>
  faucets: Array<string>
  infoURL: string
  status?: 'active' | 'incubating' | 'deprecated'
  explorers?: Array<{ name: string; url: string; standard?: string }>
  icon?: string
}

export type Erc20TokenCache = {
  chainId: number
  contractAddress: string
  symbol: string
  decimals: number
}

export type EvmNetworkIconCache = {
  icon: string
  etag: string
  path: string
}

export type CoingeckoAssetPlatform = {
  id: string
  chain_identifier: number | null
  name: string
  shortname: string
  native_coin_id: string | null
}

export type CoingeckoCoin = {
  id: string
  symbol: string
  name: string
  platforms: Record<string, string>
}

export type CoingeckoCoinDetails = CoingeckoCoin & {
  id: string
  symbol: string
  name: string
  platforms: Record<string, string>
  image: Record<'thumb' | 'small' | 'large', string>
  last_updated: string | null
  market_cap_rank: number | null
}

// Some handy types from https://www.typescriptlang.org/docs/handbook/advanced-types.html#distributive-conditional-types
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never
}[keyof T]
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>
export type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]
export type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>
