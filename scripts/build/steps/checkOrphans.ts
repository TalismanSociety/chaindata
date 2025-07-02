import { isNetworkEth, NetworkSchema, TokenSchema } from '@talismn/chaindata-provider'
import keyBy from 'lodash/keyBy'
import { z } from 'zod/v4'

import { FILE_OUTPUT_NETWORKS_ALL, FILE_OUTPUT_TOKENS_ALL } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'

export const checkOrphans = () => {
  const networks = parseJsonFile(FILE_OUTPUT_NETWORKS_ALL, z.array(NetworkSchema))
  const tokens = parseJsonFile(FILE_OUTPUT_TOKENS_ALL, z.array(TokenSchema))

  const dicNetworks = keyBy(networks, 'id')
  const dicTokens = keyBy(tokens, 'id')

  const tokensWithoutNetwork = tokens.filter((token) => !dicNetworks[token.networkId])
  if (tokensWithoutNetwork.length) {
    const networkIds = new Set(...tokensWithoutNetwork.map((token) => token.networkId))
    console.warn(`Found ${tokensWithoutNetwork.length} orphan tokens on ${networkIds.size} networks`)
  }

  const networksWithoutNativeToken = networks.filter((network) => !dicTokens[network.nativeTokenId])
  if (networksWithoutNativeToken.length) {
    console.warn(
      `Found ${networksWithoutNativeToken.length} networks without native token: `,
      networksWithoutNativeToken.map((n) => n.id).join(', '),
    )
  }

  const networksWithoutSubstrateChain = networks
    .filter(isNetworkEth)
    .filter((network) => network.substrateChainId && !dicNetworks[network.substrateChainId])
  if (networksWithoutSubstrateChain.length) {
    console.warn(
      `Found ${networksWithoutSubstrateChain.length} Eth networks without substrate chain:`,
      networksWithoutSubstrateChain.map((n) => n.id).join(', '),
    )
  }
}
