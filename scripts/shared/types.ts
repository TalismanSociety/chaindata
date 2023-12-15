import type { MiniMetadata } from '@talismn/balances'
import type { EvmErc20ModuleConfig, EvmNativeModuleConfig } from '@talismn/balances'
import { Token } from '@talismn/chaindata-provider'

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
  implName: string
  specName: string
  specVersion: string

  // These are separated into their own build files, `tokens/all.json` and `miniMetadatas/all.json`
  miniMetadatas: Record<string, MiniMetadata>
  tokens: Record<string, Token>
}

export type EvmNetworkRpcCache = {
  chainId: string
  rpcUrl: string
  isValid: boolean
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
