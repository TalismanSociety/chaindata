import { checkEthereumRpcs } from './checkEthereumRpcs'
import { checkPolkadotRpcs } from './checkPolkadotRpcs'
import { fetchCoingeckoTokensLogos } from './fetchCoingeckoTokensLogos'
import { fetchDotNetworksMetadataExtracts } from './fetchDotNetworksMetadataExtracts'
import { fetchDotNetworksSpecs } from './fetchDotNetworksSpecs'
import { fetchDotTokens } from './fetchDotTokens'
import { fetchEthTokens } from './fetchEthTokens'
import { fetchKnownEvmNetworks } from './fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksCoingeckoLogos } from './fetchKnownEvmNetworksCoingeckoLogos'
import { fetchKnownEvmNetworksLogos } from './fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetchKnownEvmTokens'
import { fetchNovasamaMetadataPortalUrls } from './fetchNovasamaMetadataPortalUrls'
import { validateConfigFiles } from './validateConfigFiles'

export const fetchExternalSteps: Array<() => Promise<void> | void> = [
  validateConfigFiles,
  fetchKnownEvmNetworks,
  checkPolkadotRpcs,
  checkEthereumRpcs,
  fetchKnownEvmNetworksCoingeckoLogos,
  fetchKnownEvmTokens,
  fetchKnownEvmNetworksLogos,
  fetchNovasamaMetadataPortalUrls,
  fetchDotNetworksSpecs,
  fetchDotNetworksMetadataExtracts,
  fetchDotTokens,
  fetchEthTokens,
  fetchCoingeckoTokensLogos,
]
