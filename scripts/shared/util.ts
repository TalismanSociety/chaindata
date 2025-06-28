import { existsSync, PathLike, readFileSync, writeFileSync } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'

import { WsProvider } from '@polkadot/api'
import fromPairs from 'lodash/fromPairs'
import prettier from 'prettier'
import { parse as parseYaml, stringify as yamlify } from 'yaml'
import z, { ZodError } from 'zod/v4'

import {
  DIR_OUTPUT,
  FILE_INPUT_COINGECKO_OVERRIDES,
  GITHUB_BRANCH,
  GITHUB_CDN,
  GITHUB_ORG,
  GITHUB_REPO,
  PRETTIER_CONFIG,
} from './constants'
import { CoingeckoOverridesFileSchema } from './schemas/CoingeckoOverrides'

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

export const throwAfter = (ms: number, reason: string) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(reason)), ms))

export const withTimeout = <T>(func: () => Promise<T>, timeout: number, msgPrefix?: string): Promise<T> =>
  Promise.race([func(), throwAfter(timeout, `${msgPrefix ? `${msgPrefix}:` : ''}Timeout after ${timeout}ms`)])

export const getRpcProvider = (rpcs: string[], autoConnectMs = 5_000, timeout = autoConnectMs) =>
  new WsProvider(
    rpcs,
    autoConnectMs,
    {
      Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
    },
    timeout,
  )

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

export const assetUrlPrefixChaindataProvider = `${GITHUB_CDN}/${GITHUB_ORG}/${GITHUB_REPO}/main/`
export const assetUrlPrefix = `${GITHUB_CDN}/${GITHUB_ORG}/${GITHUB_REPO}/${GITHUB_BRANCH}/`
export const assetPathPrefix = './'

// logos are crafted by the balances libs which use main branch to build urls
export const fixAssetUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined
  const assetPath = getAssetPathFromUrl(url)
  const res = getAssetUrlFromPath(assetPathPrefix + assetPath)
  return res
}

export const getAssetUrlFromPath = (path: string | undefined) => {
  if (!path) return path
  if (!path.startsWith(assetPathPrefix)) throw new Error(`Invalid asset path: ${path}`)
  if (!existsSync(path)) return undefined
  return `${assetUrlPrefix}${path.slice(assetPathPrefix.length)}`
}

export const getAssetPathFromUrl = (url: string) => {
  if (url.startsWith(assetPathPrefix)) return url.slice(assetPathPrefix.length)
  if (url.startsWith(assetUrlPrefixChaindataProvider)) return url.slice(assetUrlPrefixChaindataProvider.length)
  if (url.startsWith(assetUrlPrefix)) return url.slice(assetUrlPrefix.length)
  throw new Error(`Invalid asset url: ${url}`)
}

export const getTokenLogoUrl = (
  logo: string | undefined,
  coingeckoId: string | undefined,
  symbol: string | undefined,
) => {
  // if logo is set and is not a relative path, assume it's a good full url
  if (logo && !logo.startsWith(assetPathPrefix)) return logo

  // if logo is relative and exists, perfect
  if (logo && logo.startsWith(assetPathPrefix) && existsSync(logo)) return getAssetUrlFromPath(logo)

  // fallback to coingeckoId if provided
  const cgPath = getCoingeckoTokenAssetPath(coingeckoId)
  if (cgPath) return getAssetUrlFromPath(cgPath)

  // try to find a match in /assets/tokens/ folder
  if (symbol)
    for (const ext of ['svg', 'webp', 'png']) {
      const symbolPath = `./assets/tokens/${symbol.toLowerCase()}.${ext}`
      if (existsSync(symbolPath)) return getAssetUrlFromPath(symbolPath)
    }

  return undefined
}

let COINGECKO_LOGO_OVERRIDES: Record<string, string | undefined> | null = null

const getCoingeckoTokenAssetPath = (coingeckoId: string | undefined) => {
  if (!coingeckoId) return undefined

  if (COINGECKO_LOGO_OVERRIDES === null) {
    const overrides = parseYamlFile(FILE_INPUT_COINGECKO_OVERRIDES, CoingeckoOverridesFileSchema)
    COINGECKO_LOGO_OVERRIDES = fromPairs(overrides.map((override) => [override.id, override.logo]))
  }

  if (COINGECKO_LOGO_OVERRIDES[coingeckoId] && existsSync(COINGECKO_LOGO_OVERRIDES[coingeckoId]))
    return COINGECKO_LOGO_OVERRIDES[coingeckoId]

  const cgPath = `./assets/tokens/coingecko/${coingeckoId}.webp`
  if (existsSync(cgPath)) return cgPath

  return undefined
}

export const getNetworkLogoUrl = (
  logo: string | undefined,
  id: string | undefined,
  nativeToken: {
    logo?: string
    symbol?: string
    coingeckoId?: string
  },
) => {
  // if logo is set and is not a relative path, assume it's a good full url
  if (logo && !logo.startsWith(assetPathPrefix)) return logo

  // if logo is relative and exists, perfect
  if (logo && logo.startsWith(assetPathPrefix) && existsSync(logo)) return getAssetUrlFromPath(logo)

  // try to find a match in /assets/chains/ folder
  if (id)
    for (const ext of ['svg', 'webp', 'png']) {
      const symbolPath = `./assets/chains/${id}.${ext}`
      if (existsSync(symbolPath)) return getAssetUrlFromPath(symbolPath)
    }

  // use native token logo if available
  return getTokenLogoUrl(nativeToken.logo, nativeToken.coingeckoId, nativeToken.symbol)
}

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

type WriteJsonOptions<T> = {
  schema?: z.ZodType<T>
  format?: boolean
}

export const writeJsonFile = async <T>(
  filePath: string,
  data: unknown,
  opts: WriteJsonOptions<T> = {},
): Promise<void> => {
  opts = Object.assign({ format: true }, opts)

  if (!filePath.endsWith('.json')) throw new Error(`Invalid file extension for JSON file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  await mkdirRecursive(dirname(filePath))

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

export const writeYamlFile = async <T>(
  filePath: string,
  data: unknown,
  opts: WriteJsonOptions<T> = {},
): Promise<void> => {
  opts = Object.assign({ format: true }, opts)

  if (!filePath.endsWith('.yaml')) throw new Error(`Invalid file extension for YAML file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  await mkdirRecursive(dirname(filePath))

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

/**
 * Outputs the data to the console if validation fails, useful for debugging
 */
export const validateDebug = <T>(data: T, schema: z.ZodType<T>, label: string): T => {
  try {
    return schema.parse(data)
  } catch (err) {
    console.error('Failed to validate %s:', label, data)
    console.error(err as ZodError)
    throw new Error(`Invalid data for ${label}`)
  }
}

export const logDuration = (label: string) => {
  const start = process.hrtime()

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins ? `${mins}m ${secs}s` : `${secs}s`
  }

  return () => {
    const stop = process.hrtime(start)
    const elapsed = stop[0] + stop[1] / 1e9

    console.log(`Completed ${label} in ${formatDuration(elapsed)}`)
  }
}
