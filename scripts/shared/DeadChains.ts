import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { FILE_DEAD_CHAINS, PRETTIER_CONFIG } from './constants'

type Data = Map<
  /** chain id */
  string,
  DataChain
>
type DataChain = Map<
  /** rpc url */
  string,
  /** dead stats */
  DataRpc
>
type DataRpc = {
  /** number of failed attempts */
  count: number
  /** date of first failed attempt */
  dead_since: string
  /** date of most recent failed attempt */
  last_check: string
}

export class DeadChains {
  #data: Data = new Map()

  /** Track a chain RPC as being dead */
  isDead(chainId: string, rpcUrl: string) {
    const chain: DataChain = this.#data.get(chainId) ?? new Map()
    const rpc: DataRpc = chain.get(rpcUrl) ?? { count: 0, dead_since: this.now(), last_check: this.now() }

    rpc.count += 1
    rpc.last_check = this.now()

    chain.set(rpcUrl, rpc)
    this.#data.set(chainId, chain)
  }

  /** Track a chain RPC as being alive */
  isAlive(chainId: string, rpcUrl: string) {
    const chain = this.#data.get(chainId)
    if (!chain) return

    chain.delete(rpcUrl)
    if (!chain.size) this.#data.delete(chainId)
  }

  /** Initialize the cache from disk */
  async load(): Promise<DeadChains> {
    const jsonToData = (json: any) =>
      new Map(Object.entries(json).map(([key, value]: any) => [key, new Map(Object.entries(value))]))

    const json = await (async () => {
      try {
        return await readFile(FILE_DEAD_CHAINS, 'utf-8')
      } catch (error) {
        console.error('Failed to read dead chains', error)
        return '{}'
      }
    })()
    this.#data = jsonToData(JSON.parse(json)) as Data

    return this
  }

  /** Write the cache to disk */
  async save() {
    const dataToJson = (data: Data) =>
      Object.fromEntries([...data].map(([key, value]) => [key, Object.fromEntries([...value])]))

    // sort the dead chains list by the number of times we've failed to connect to each chain's RPCs
    this.#data = new Map(
      [...this.#data.entries()].sort((a, b) => {
        const aTotalCount = [...a[1].values()].reduce((acc, { count }) => acc + count, 0)
        const bTotalCount = [...b[1].values()].reduce((acc, { count }) => acc + count, 0)
        return bTotalCount - aTotalCount
      }),
    )

    const json = JSON.stringify(dataToJson(this.#data), null, 2)
    await writeFile(FILE_DEAD_CHAINS, await prettier.format(json, { ...PRETTIER_CONFIG, parser: 'json' }))
  }

  /** Remove inactive RPCs from the cache */
  trim(activeChainRpcs: Map<string, Set<string>>) {
    this.#data.forEach((chain, chainId) => {
      for (const rpcUrl of chain.keys()) {
        if (activeChainRpcs.get(chainId)?.has(rpcUrl)) continue
        chain.delete(rpcUrl)
      }
      if (chain.size === 0) this.#data.delete(chainId)
    })
  }

  /** Get a simplified ISO-8601 timestamp which represents the current time */
  private now() {
    return new Date().toISOString()
  }
}
