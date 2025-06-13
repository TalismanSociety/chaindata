import { PathLike, readFileSync, writeFileSync } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'

import { WsProvider } from '@polkadot/api'
import { Chain, EvmNetwork, githubUnknownChainLogoUrl, githubUnknownTokenLogoUrl } from '@talismn/chaindata-provider'
import prettier from 'prettier'
import { parse as parseYaml, stringify as yamlify } from 'yaml'
import z from 'zod/v4'

import { DIR_OUTPUT, GITHUB_BRANCH, GITHUB_CDN, GITHUB_ORG, GITHUB_REPO, PRETTIER_CONFIG } from './constants'

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
  url: string | string[],
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

export const assetUrlPrefix = `${GITHUB_CDN}/${GITHUB_ORG}/${GITHUB_REPO}/${GITHUB_BRANCH}/`
export const assetPathPrefix = './'

export const getAssetUrlFromPath = (path: string) => {
  if (!path.startsWith(assetPathPrefix)) throw new Error(`Invalid asset path: ${path}`)
  return `${assetUrlPrefix}${path.slice(assetPathPrefix.length)}`
}

export const getAssetPathFromUrl = (url: string) => {
  if (!url.startsWith(assetUrlPrefix)) throw new Error(`Invalid asset url: ${url}`)
  return `${assetPathPrefix}${url.slice(assetUrlPrefix.length)}`
}

export const UNKNOWN_TOKEN_LOGO_URL = githubUnknownTokenLogoUrl
export const UNKNOWN_NETWORK_LOGO_URL = githubUnknownChainLogoUrl

/** Used to merge `known-evm-networks-overrides.json` into `known-evm-networks.json` */
export const networkMergeCustomizer = (objValue: any, srcValue: any, key: string, object: any, source: any): any => {
  // override everything except balanceConfig["evm-erc20"].tokens, which must be added one by one
  if (Array.isArray(objValue)) {
    // TODO support overriding properties on array items, such as forcing a coingeckoId for one token
    return objValue.concat(srcValue)
  }
}

export const parseYamlFile = <T>(filePath: string, schema?: z.ZodType<T>): T => {
  if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml'))
    throw new Error(`Invalid file extension for YAML file: ${filePath}`)

  const data = parseYaml(readFileSync(filePath, 'utf-8')) as T

  return schema ? validate(data, schema, filePath) : data
}

export const parseJsonFile = <T>(filePath: string, schema?: z.ZodType<T>): T => {
  if (!filePath.endsWith('.json')) throw new Error(`Invalid file extension for JSON file: ${filePath}`)

  const data = JSON.parse(readFileSync(filePath, 'utf-8')) as T

  return schema ? validate(data, schema, filePath) : data
}

type WriteJsonOptions = {
  schema?: z.ZodType<any>
  format?: boolean
}

export const writeJsonFile = async (filePath: string, data: unknown, opts: WriteJsonOptions = {}): Promise<void> => {
  if (!filePath.endsWith('.json')) throw new Error(`Invalid file extension for JSON file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  writeFileSync(filePath, opts.format ? await prettifyJson(data) : JSON.stringify(data))

  console.debug(filePath, 'updated')
}

export const prettifyJson = async (data: unknown) => {
  try {
    return await prettier.format(JSON.stringify(data, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    })
  } catch (cause) {
    // wrap error to prevent HUGE error messages
    throw new Error('Failed to prettify JSON', { cause })
  }
}

export const writeYamlFile = async (filePath: string, data: unknown, opts: WriteJsonOptions = {}): Promise<void> => {
  if (!filePath.endsWith('.yaml')) throw new Error(`Invalid file extension for YAML file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  writeFileSync(filePath, opts.format ? await prettifyYaml(data) : yamlify(data))

  console.debug(filePath, 'updated')
}

export const prettifyYaml = async (data: unknown) => {
  try {
    return await prettier.format(yamlify(data), {
      ...PRETTIER_CONFIG,
      parser: 'yaml',
    })
  } catch (cause) {
    // wrap error to prevent HUGE error messages
    throw new Error('Failed to prettify YAML', { cause })
  }
}

export const validate = <T>(data: unknown, schema: z.ZodType<T>, label: string): T => {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.error('Failed to validate', label)
    console.error(result.error)
    throw new Error('Invalid data')
  }
  return result.data
}
