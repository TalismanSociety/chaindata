import type {
  EvmErc20ModuleConfig,
  EvmNativeModuleConfig,
  EvmUniswapV2ModuleConfig,
  MiniMetadata,
} from '@talismn/balances'
import { LegacyChain, LegacyEvmNetwork, Token } from '@talismn/chaindata-provider'

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
  oldPrefix?: number
  rpcs?: string[]
  paraId?: number
  relay?: { id: string }
  balancesConfig?: Record<string, Record<string, unknown>>
  hasExtrinsicSignatureTypePrefix?: boolean
  registryTypes?: any
  signedExtensions?: any
  hasCheckMetadataHash?: boolean
}

/** Represents an EvmNetwork from `evm-networks.json` */
export type ConfigEvmNetwork = {
  id: string
  substrateChainId?: string
  name?: string
  logo?: string
  isDefault?: boolean
  forceScan?: boolean
  preserveGasEstimate?: boolean
  themeColor?: string
  isTestnet?: boolean
  explorerUrl?: string
  rpcs?: string[]
  balancesConfig?: Record<string, Record<string, unknown>> & {
    'evm-native'?: EvmNativeModuleConfig
    'evm-erc20'?: EvmErc20ModuleConfig
    'evm-uniswapv2'?: EvmUniswapV2ModuleConfig
  }
  icon?: string
  feeType?: LegacyEvmNetwork['feeType']
  l2FeeType?: LegacyEvmNetwork['l2FeeType']
  erc20aggregator?: LegacyEvmNetwork['erc20aggregator']
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
  name: string
}

export type Uniswapv2TokenCache = {
  chainId: string
  contractAddress: string
  decimals: number
  symbol0: string
  symbol1: string
  decimals0: number
  decimals1: number
  tokenAddress0: string
  tokenAddress1: string
  coingeckoId0?: string
  coingeckoId1?: string
}
