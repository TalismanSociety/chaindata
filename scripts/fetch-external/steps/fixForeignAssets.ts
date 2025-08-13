import { XcmV3Junctions } from '@polkadot-api/descriptors'
import { isTokenEvmErc20, isTokenSubForeignAssets } from '@talismn/chaindata-provider'
import { papiParse } from '@talismn/scale'

import { FILE_DOT_TOKENS_PREBUILD, FILE_ETH_TOKENS_PREBUILD } from '../../shared/constants'
import { parseJsonFile } from '../../shared/parseFile'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { EthTokensPreBuildFileSchema } from '../../shared/schemas/EthTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

type MultiLocation = { parents: 0 | 1 | 2; interior: XcmV3Junctions }

export const fixForeignAssets = async () => {
  const dotTokens = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const ethTokens = parseJsonFile(FILE_ETH_TOKENS_PREBUILD, EthTokensPreBuildFileSchema)

  for (const token of dotTokens.filter(isTokenSubForeignAssets)) {
    const onChainId = papiParse<MultiLocation>(token.onChainId)

    // Most foreign assets are registered without any metadata, making it so we default to 0 decimals.
    // => lookup the target token and replicate its metadata.
    if (
      onChainId.interior.type === 'X2' &&
      onChainId.interior.value[0].type === 'GlobalConsensus' &&
      onChainId.interior.value[0].value.type === 'Ethereum' &&
      onChainId.interior.value[1].type === 'AccountKey20'
    ) {
      const networkId = String(onChainId.interior.value[0].value.value.chain_id)
      const contractAddress = onChainId.interior.value[1].value.key.asHex()
      const targetToken = ethTokens
        .filter(isTokenEvmErc20)
        .find((t) => t.networkId === networkId && t.contractAddress === contractAddress)

      if (targetToken) {
        // copy relevant fields from the target token, but keep symbol as is (we usually suffix with .e manually)
        token.decimals = targetToken.decimals
        token.coingeckoId = targetToken.coingeckoId
        token.logo = targetToken.logo

        // if name has been set, keep it
        if (!token.name) token.name = targetToken.name
      }
    }

    // TODO: do the same for non erc20 tokens, same problem most likely exists for them as well
  }

  await writeJsonFile(FILE_DOT_TOKENS_PREBUILD, dotTokens, {
    schema: DotTokensPreBuildFileSchema,
  })
}
