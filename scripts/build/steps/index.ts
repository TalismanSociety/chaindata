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

// to provide better debugging experience, output of each step is now persisted in the output directory
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

  cleanupOutputs, // use gitignore instead
]
