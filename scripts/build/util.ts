import { PathLike } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'

import { WsProvider } from '@polkadot/api'
import { Chain, EvmNetwork } from '@talismn/chaindata-provider'

import { DIR_OUTPUT } from './constants'

// Can be used for nicer vscode syntax highlighting & auto formatting
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#raw_strings
//
// Doesn't actually transform the string at all :)
export const html = (strings: readonly string[], ...substitutions: any[]) =>
  String.raw({ raw: strings }, ...substitutions)
export const gql = (strings: readonly string[], ...substitutions: any[]) =>
  String.raw({ raw: strings }, ...substitutions)

export const cleanupOutputDir = async () => await rm(DIR_OUTPUT, { recursive: true, force: true })

export const exists = async (path: PathLike) =>
  await access(path)
    .then(() => true)
    .catch(() => false)

// keep track of written files, so we can provide links from an index page
const fileList: string[] = []
export const getFileList = () => fileList.slice() // return a copy

// write file (first ensures file directory exists, and also adds file path to `fileList`)
export const writeChaindataFile = async (destination: string, content: string) => {
  const fullDestination = join(DIR_OUTPUT, destination)

  const directory = dirname(fullDestination)
  await mkdirRecursive(directory)

  fileList.push(destination)
  await writeFile(fullDestination, content)
}

// TODO: Replace `mkdirRecursive` with `mkdir(path, { recursive: true })` after this is fixed:
// https://github.com/oven-sh/bun/issues/4627#issuecomment-1732855199
export const mkdirRecursive = async (path: string) => {
  const splits = path.split(sep)
  for (const [index, split] of splits.entries()) {
    const directory = join(...splits.slice(0, index), split)

    if (await exists(directory)) continue
    await mkdir(directory)
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const sendWithTimeout = async (
  url: string,
  requests: Array<[string, any?]>,
  timeout: number = 10_000,
): Promise<any[]> => {
  const autoConnectMs = 0
  const ws = new WsProvider(
    url,
    autoConnectMs,
    {
      // our extension will send this header with every request
      // some RPCs reject this header
      // for those that reject, we want the chaindata CI requests to also reject
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    // doesn't matter what this is as long as it's a bit larger than `timeout`
    // if it's not set then `new WsProvider` will throw an uncatchable error after 60s
    timeout * 99,
  )

  return await (async () => {
    try {
      // try to connect to chain
      await ws.connect()

      const isReadyTimeout = sleep(timeout).then(() => {
        throw new Error('timeout (isReady)')
      })
      await Promise.race([ws.isReady, isReadyTimeout])

      const requestTimeout = sleep(timeout).then(() => {
        throw new Error('timeout (request)')
      })
      return await Promise.race([
        Promise.all(requests.map(([method, params = []]) => ws.send<any>(method, params))),
        requestTimeout,
      ])
    } finally {
      ws.disconnect()
    }
  })()
}

export const sortChainsAndNetworks = (chains: Chain[], evmNetworks: EvmNetwork[]): Array<Chain | EvmNetwork> => {
  return [...chains, ...evmNetworks]
    .sort((a, b) => {
      if (a.id === b.id) return 0
      if (a.id === 'polkadot') return -1
      if (b.id === 'polkadot') return 1
      if (a.id === 'kusama') return -1
      if (b.id === 'kusama') return 1
      if (a.isTestnet !== b.isTestnet) {
        if (a.isTestnet) return 1
        if (b.isTestnet) return -1
      }
      if (a.id === 'westend-testnet') return -1
      if (b.id === 'westend-testnet') return 1
      if (a.id === 'rococo-testnet') return -1
      if (b.id === 'rococo-testnet') return 1

      const aCmp = a.name?.toLowerCase() || parseInt(a.id)
      const bCmp = b.name?.toLowerCase() || parseInt(b.id)

      if (typeof aCmp === 'number' && typeof bCmp === 'number') return aCmp - bCmp
      if (typeof aCmp === 'number') return 1
      if (typeof bCmp === 'number') return -1

      return aCmp.localeCompare(bCmp)
    })
    .map((chainOrNetwork, index) => {
      chainOrNetwork.sortIndex = index + 1
      return chainOrNetwork
    })
}
