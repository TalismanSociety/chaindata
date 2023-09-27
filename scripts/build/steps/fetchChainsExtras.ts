import { Metadata, TypeRegistry } from '@polkadot/types'
import { PromisePool } from '@supercharge/promise-pool'
import { Chain, ChainId } from '@talismn/chaindata-provider'

import { PROCESS_CONCURRENCY, RPC_REQUEST_TIMEOUT } from '../constants'
import { sendWithTimeout } from '../util'
import { sharedData } from './_sharedData'

export const fetchChainsExtras = async () => {
  const { chains } = sharedData

  const fetchDataForChain = createDataFetcher({ numChains: chains.length })

  // PromisePool lets us run `fetchChainExtras` on all of the chains in parallel,
  // but with a max limit on how many chains we are fetching data for at the same time
  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(chains.map((chain) => chain.id))
    .process(fetchDataForChain)
}

const createDataFetcher =
  ({ numChains }: { numChains: number }) =>
  async (chainId: ChainId, index: number): Promise<void> => {
    console.log(`Fetching extras for chain ${index + 1} of ${numChains} (${chainId})`)

    // fetch extras for chain
    // makes use of the chain rpcs
    await fetchChainExtras(chainId)
  }

const fetchChainExtras = async (chainId: ChainId) => {
  const { chains } = sharedData

  const chain = chains.find((chain) => chain.id === chainId)
  if (!chain) return

  const rpcs = chain.rpcs?.map(({ url }) => url) ?? []
  const maxAttempts = rpcs.length * 2 // attempt each rpc twice, at most

  if (maxAttempts === 0) return

  let success = false
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    success = await attemptToFetchChainExtras(chain, rpcs[(attempt - 1) % rpcs.length], attempt, maxAttempts)

    // if chain has been successfully updated, exit the loop here
    if (success) break
  }

  // ran out of attempts
  if (!success) console.warn(`Fetching extras for chain ${chain.id}: all attempts (${maxAttempts}) failed`)
}

const attemptToFetchChainExtras = async (
  chain: Chain,
  rpcUrl: string,
  attempt: number,
  maxAttempts: number
): Promise<boolean> => {
  try {
    // fetch rpc data
    const [genesisHash, runtimeVersion, metadataRpc, chainName, chainProperties] = await sendWithTimeout(
      rpcUrl,
      [
        ['chain_getBlockHash', [0]],
        ['state_getRuntimeVersion', []],
        ['state_getMetadata', []],
        ['system_chain', []],
        ['system_properties', []],
        // // TODO: Get parachainId from storage
        // ['state_getStorage', ['0x0d715f2646c8f85767b5d2764bb2782604a74d81251e398fd8a0a4d55023bb3f']],
      ],
      RPC_REQUEST_TIMEOUT
    )

    // deconstruct rpc data
    const { specName, specVersion, implName } = runtimeVersion
    const { ss58Format } = chainProperties

    const metadata: Metadata = new Metadata(new TypeRegistry(), metadataRpc)
    metadata.registry.setMetadata(metadata)

    const ss58Prefix = metadata.registry.chainSS58

    // set values
    chain.genesisHash = genesisHash
    chain.prefix = typeof ss58Prefix === 'number' ? ss58Prefix : typeof ss58Format === 'number' ? ss58Format : 42
    chain.chainName = chainName
    chain.implName = implName
    chain.specName = specName
    chain.specVersion = specVersion
    // chain.nativeToken = await getOrCreate(store, Token, nativeToken.id)

    // chain was successfully updated!
    console.log(`Fetching extras succeeded for chain ${chain.id}`)
    return true
  } catch (error) {
    console.warn(
      `Fetching extras for chain ${chain.id}: attempt ${attempt} of ${maxAttempts} failed: ${
        (error as Error)?.message ?? error
      } (${rpcUrl})`
    )
  }

  // update was unsuccessful
  return false
}
