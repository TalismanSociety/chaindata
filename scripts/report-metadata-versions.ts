import { readFileSync } from 'node:fs'

import { u32, Vector } from '@polkadot-api/substrate-bindings'
import { WsProvider } from '@polkadot/rpc-provider'
import { DotNetwork, Network } from '@talismn/chaindata-provider'
import { decAnyMetadata } from '@talismn/scale'

import { DIR_OUTPUT } from './shared/constants'
import { parseJsonFile } from './shared/util'

const chains: DotNetwork[] = parseJsonFile<Network[]>(`${DIR_OUTPUT}/networks.json`).filter(
  (n) => n.platform === 'polkadot',
)

type Result = DotNetwork & { metadataVersions: number[] | 'timeout' }
const results: Result[] = []

console.log('%d networks', chains.length)

const getProviderVersions = async (chain: DotNetwork, provider: WsProvider): Promise<number[]> => {
  const timeout = setTimeout(() => {
    provider.disconnect()
  }, 11_000)

  try {
    await provider.isReady

    try {
      const resVersions = await provider.send('state_call', ['Metadata_metadata_versions', '0x'], true)
      const versions = Vector(u32).dec(resVersions)
      return versions.filter((v) => v < 100) // ignore 4294967295 - JAM?
    } catch (error) {
      console.log('Metadata_metadata_versions is not available on', chain.id, chain.name, (error as any)?.message)
      // ignore
    }

    try {
      const resDefaultMetadata = await provider.send('state_getMetadata', [])
      const metadata = decAnyMetadata(resDefaultMetadata)
      const version = Number(metadata.metadata.tag.slice(1))
      return [version]
    } catch (error) {
      console.warn('error getting default metadata for chain', chain.id, chain.name, (error as any)?.message)
    }
  } finally {
    provider.disconnect()
  }

  clearTimeout(timeout)
  return []
}

const getChainVersions = async (chain: DotNetwork): Promise<number[] | 'timeout'> => {
  if (!chain.rpcs?.length) {
    console.log('skipping chain without RPCs', chain.id, chain.name)
    return []
  }

  const provider = new WsProvider(
    chain.rpcs,
    2_000,
    {
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    5_000,
  )

  return await Promise.race([
    getProviderVersions(chain, provider),
    new Promise<number[] | 'timeout'>((resolve) => {
      setTimeout(() => {
        resolve('timeout')
      }, 10_000)
    }),
  ])
}

for (const chain of chains) {
  const abortController = new AbortController()
  console.log('chain', chain.id, chain.name)
  const metadataVersions = await getChainVersions(chain)
  abortController.abort()
  results.push(Object.assign({}, chain, { metadataVersions }))
}

const chainsAndVersions = results
  .map((chain) => ({
    id: chain.id,
    name: chain.name,
    version:
      chain.metadataVersions === 'timeout'
        ? 'timeout'
        : chain.metadataVersions.length
          ? Math.max(...chain.metadataVersions)
          : 0,
  }))
  .sort((a, b) => {
    // timeout last
    if (a.version === 'timeout' && b.version !== 'timeout') return 1
    if (b.version === 'timeout' && a.version !== 'timeout') return -1
    // sort by version
    if (a.version === b.version) return 0
    return a.version < b.version ? -1 : 1
  })

console.table(chainsAndVersions)
