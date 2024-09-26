import { fetchCoingeckoTokensLogos } from './fetchCoingeckoTokensLogos'
import { fetchErc20TokenSymbols } from './fetchErc20TokenSymbols'
import { fetchKnownEvmNetworks } from './fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksLogos } from './fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetchKnownEvmTokens'
import { fetchNovasamaMetadataPortalUrls } from './fetchNovasamaMetadataPortalUrls'
import { fetchUniswapv2TokenExtras } from './fetchUniswapv2TokenExtras'
import { updateChainsExtrasCache } from './updateChainsExtrasCache'
import { updateKnownEvmErc20TokensFromCache } from './updateKnownEvmErc20TokensFromCache'

export const fetchExternalSteps: Array<() => Promise<void>> = [
  // fetchKnownEvmNetworks,
  // fetchKnownEvmTokens,
  // fetchErc20TokenSymbols,
  // updateKnownEvmErc20TokensFromCache,

  // // NOTE: Put after the ERC20 steps, this one needs up-to-date erc20 coingeckoIds
  // // It extracts them from known-evm-networks.json & known-evm-networks-overrides.json!
  // fetchUniswapv2TokenExtras,

  // fetchKnownEvmNetworksLogos,
  // fetchCoingeckoTokensLogos,
  // fetchNovasamaMetadataPortalUrls,
  updateChainsExtrasCache,
]
