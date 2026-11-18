import type { ChainConnectorSolStub } from '@talismn/chain-connectors'
import { address } from '@solana/kit'
import { getMintDecoder } from '@solana-program/token-2022'
import { isNonTransferable } from '@talismn/balances'
import chunk from 'lodash/chunk'

// `${networkId}:${mintAddress}` -> whether that Token-2022 mint has the NonTransferable extension
export type NonTransferableMintsCache = Record<string, boolean>

const MINT_LOOKUP_BATCH_SIZE = 100

/**
 * Returns the Token-2022 mints among `mintAddresses` that have the NonTransferable extension.
 * The extension can only be added when a mint is initialized, so a mint's answer is cached for good.
 * A mint that can't be fetched or decoded is left out of the cache and looked up again on the next run.
 */
export const getNonTransferableMints = async ({
  connector,
  networkId,
  mintAddresses,
  cache,
}: {
  connector: ChainConnectorSolStub
  networkId: string
  mintAddresses: string[]
  cache: NonTransferableMintsCache
}): Promise<Set<string>> => {
  const unknownMintAddresses = [...new Set(mintAddresses)].filter(
    (mintAddress) => !(getNonTransferableMintsCacheKey(networkId, mintAddress) in cache),
  )

  if (unknownMintAddresses.length) {
    console.log('Fetching %s Token-2022 mint accounts on %s', unknownMintAddresses.length, networkId)

    const rpc = await connector.getRpc()
    const mintDecoder = getMintDecoder()

    for (const batch of chunk(unknownMintAddresses, MINT_LOOKUP_BATCH_SIZE)) {
      const { value: accounts } = await rpc
        .getMultipleAccounts(
          batch.map((mintAddress) => address(mintAddress)),
          { encoding: 'base64' },
        )
        .send()

      accounts.forEach((account, index) => {
        const mintAddress = batch[index]
        if (!account) {
          console.warn('Token-2022 mint %s not found on %s', mintAddress, networkId)
          return
        }

        try {
          const mint = mintDecoder.decode(Buffer.from(account.data[0], 'base64'))
          cache[getNonTransferableMintsCacheKey(networkId, mintAddress)] = isNonTransferable(mint)
        } catch (cause) {
          console.warn(
            'Failed to decode Token-2022 mint %s on %s: %s',
            mintAddress,
            networkId,
            (cause as Error).message,
          )
        }
      })
    }
  }

  return new Set(
    mintAddresses.filter((mintAddress) => cache[getNonTransferableMintsCacheKey(networkId, mintAddress)] === true),
  )
}

const getNonTransferableMintsCacheKey = (networkId: string, mintAddress: string) => `${networkId}:${mintAddress}`
