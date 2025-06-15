import { cleanupOutputDir } from '../../shared/util'
import { addThemeColors } from './addThemeColors'
import { buildConsolidatedData } from './buildConsolidatedData'
import { buildEthereumNetworks } from './buildEthereumNetworks'
import { buildEthereumTokens } from './buildEthereumTokens'
import { buildPolkadotMiniMetadatas } from './buildPolkadotMiniMetadatas'
import { buildPolkadotNetworks } from './buildPolkadotNetworks'
import { buildPolkadotTokens } from './buildPolkadotTokens'
import { checkOrphans } from './checkOrphans'

// to provide better debugging experience, output of each step is now persisted in the output directory
export const buildSteps: Array<() => Awaited<void>> = [
  cleanupOutputDir,

  buildPolkadotTokens,
  buildPolkadotNetworks,
  buildPolkadotMiniMetadatas,

  buildEthereumNetworks,
  buildEthereumTokens,

  addThemeColors,

  // TODO identify duplicates in tokens and networks

  // TODO theme colors
  // TODO check novasama

  // TODO fix logo urls ?

  // TODO remove orphan tokens
  // TODO remove orphan substrateChainId ?
  // TODO check each network has an existing nativeTokenId

  buildConsolidatedData,

  checkOrphans,

  // loadConfig,

  // addChains,
  // mergeChainsExtras,
  // addNovasamaMetadataPortalUrls,

  // addEvmNetworks,
  // removeInvalidErc20Tokens,
  // fixChainEvmNetworkRelations,

  // updateSortIndexes,

  // applyNativeTokenOverrides,
  // setTokenLogos,
  // addThemeColors,

  // writeChaindataIndex,
]
