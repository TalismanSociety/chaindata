import { cleanupOutputDir } from '../../shared/util'
import { addThemeColors } from './addThemeColors'
import { buildConsolidatedData } from './buildConsolidatedData'
import { buildEthereumNetworks } from './buildEthereumNetworks'
import { buildEthereumTokens } from './buildEthereumTokens'
import { buildPolkadotMiniMetadatas } from './buildPolkadotMiniMetadatas'
import { buildPolkadotNetworks } from './buildPolkadotNetworks'
import { buildPolkadotTokens } from './buildPolkadotTokens'
import { checkOrphans } from './checkOrphans'
import { cleanupOutputs } from './cleanupOutputs'

export const buildSteps: Array<() => Awaited<void>> = [
  cleanupOutputDir,

  buildPolkadotNetworks,
  buildPolkadotTokens,
  buildPolkadotMiniMetadatas,

  buildEthereumNetworks,
  buildEthereumTokens,

  addThemeColors,
  buildConsolidatedData,

  checkOrphans,

  // PRO TIP: comment this one while debugging outputs
  // cleanupOutputs,
]
