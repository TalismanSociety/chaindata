import { fetchCoingeckoTokensLogos } from './fetchCoingeckoTokensLogos'
import { fetchErc20TokenSymbols } from './fetchErc20TokenSymbols'
import { fetchKnownEvmNetworks } from './fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksLogos } from './fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetchKnownEvmTokens'
import { fetchNovasamaMetadataPortalUrls } from './fetchNovasamaMetadataPortalUrls'
import { updateChainsExtrasCache } from './updateChainsExtrasCache'
import { updateKnownEvmTokensFromCache } from './updateKnownEvmTokensFromCache'

export const fetchExternalSteps: Array<() => Promise<void>> = [
  fetchKnownEvmNetworks,
  fetchKnownEvmTokens,
  fetchErc20TokenSymbols,
  updateKnownEvmTokensFromCache,
  fetchKnownEvmNetworksLogos,
  fetchCoingeckoTokensLogos,
  fetchNovasamaMetadataPortalUrls,
  updateChainsExtrasCache,
]
