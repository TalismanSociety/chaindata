import { readFile, writeFile } from 'node:fs/promises'

import { Metadata, TypeRegistry } from '@polkadot/types'
import { PromisePool } from '@supercharge/promise-pool'
import { ChainId } from '@talismn/chaindata-provider'
import prettier from 'prettier'

import { PROCESS_CONCURRENCY, RPC_REQUEST_TIMEOUT } from '../../shared/constants'
import { ChainExtrasCache, ConfigChain } from '../../shared/types'
import { sendWithTimeout } from '../../shared/util'

export const updateChainsExtrasCache = async () => {
  const mainnets = JSON.parse(await readFile('chaindata.json', 'utf-8')) as ConfigChain[]
  const testnets = JSON.parse(await readFile('testnets-chaindata.json', 'utf-8')) as ConfigChain[]
  const chainsExtrasCache = JSON.parse(await readFile('chains-extras-cache.json', 'utf-8')) as ChainExtrasCache[]

  const chains = [...mainnets, ...testnets]
  const fetchDataForChain = createDataFetcher({ chains, chainsExtrasCache })

  // PromisePool lets us run `fetchChainExtras` on all of the chains in parallel,
  // but with a max limit on how many chains we are fetching data for at the same time
  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for(chains.map((chain) => chain.id))
    .process(fetchDataForChain)

  await writeFile(
    'chains-extras-cache.json',
    await prettier.format(JSON.stringify(chainsExtrasCache, null, 2), {
      parser: 'json',
    }),
  )
}

const createDataFetcher =
  ({ chains, chainsExtrasCache }: { chains: ConfigChain[]; chainsExtrasCache: ChainExtrasCache[] }) =>
  async (chainId: ChainId, index: number): Promise<void> => {
    console.log(`Updating extras for chain ${index + 1} of ${chains.length} (${chainId})`)

    // fetch extras for chain
    // makes use of the chain rpcs
    await fetchChainExtras(chainId, chains, chainsExtrasCache)
  }

const fetchChainExtras = async (chainId: ChainId, chains: ConfigChain[], chainsExtrasCache: ChainExtrasCache[]) => {
  const chain = chains.find((chain) => chain.id === chainId)
  if (!chain?.rpcs) return

  const chainExtrasCache = chainsExtrasCache.find((cc) => cc.id === chainId)
  if (chainExtrasCache) {
    try {
      // if specVersion hasn't changed, no need to update
      const [runtimeVersion] = await sendWithTimeout(chain.rpcs, [['state_getRuntimeVersion', []]], RPC_REQUEST_TIMEOUT)
      if (String(runtimeVersion.specVersion) === chainExtrasCache.specVersion) return
    } catch (err) {
      console.log('Failed to fetch runtime version for %s', chainId, (err as any).message ?? 'unknown error')
      return
    }
  }

  const rpcs = chain.rpcs ?? []
  const maxAttempts = rpcs.length * 2 // attempt each rpc twice, at most

  if (maxAttempts === 0) return

  let success = false
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    success = await attemptToFetchChainExtras(
      chain,
      rpcs[(attempt - 1) % rpcs.length],
      attempt,
      maxAttempts,
      chainsExtrasCache,
    )

    // if chain has been successfully updated, exit the loop here
    if (success) break
  }

  // ran out of attempts
  if (!success) console.warn(`Fetching extras for chain ${chain.id}: all attempts (${maxAttempts}) failed`)
}

const attemptToFetchChainExtras = async (
  chain: ConfigChain,
  rpcUrl: string,
  attempt: number,
  maxAttempts: number,
  chainsExtrasCache: ChainExtrasCache[],
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
      RPC_REQUEST_TIMEOUT,
    )

    // deconstruct rpc data
    const { specName, specVersion, implName } = runtimeVersion
    const { ss58Format } = chainProperties

    const metadata: Metadata = new Metadata(new TypeRegistry(), metadataRpc)
    metadata.registry.setMetadata(metadata)

    const ss58Prefix = metadata.registry.chainSS58

    const chainExtrasCache =
      chainsExtrasCache.find((cc) => cc.id === chain.id) ??
      ({
        id: chain.id,
      } as ChainExtrasCache)

    // set values
    chainExtrasCache.genesisHash = genesisHash
    chainExtrasCache.prefix =
      typeof ss58Prefix === 'number' ? ss58Prefix : typeof ss58Format === 'number' ? ss58Format : 42
    chainExtrasCache.chainName = chainName
    chainExtrasCache.implName = implName
    chainExtrasCache.specName = specName
    chainExtrasCache.specVersion = String(specVersion)

    if (!chainsExtrasCache.includes(chainExtrasCache)) chainsExtrasCache.push(chainExtrasCache)

    return true
  } catch (error) {
    console.warn(
      `Fetching extras for chain ${chain.id}: attempt ${attempt} of ${maxAttempts} failed: ${
        (error as Error)?.message ?? error
      } (${rpcUrl})`,
    )
  }

  // update was unsuccessful
  return false
}
