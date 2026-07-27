import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@polkadot-api/substrate-client'
import { PromisePool } from '@supercharge/promise-pool'
import { parseMetadataRpc, toHex } from '@talismn/scale'
import { getWsProvider } from 'polkadot-api/ws'
import sharp from 'sharp'

import {
  DIR_ASSETS_TOKENS_DTAO,
  FILE_DOT_TOKENS_PREBUILD,
  FILE_DTAO_TOKEN_LOGOS_CACHE,
  FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT,
} from '../../shared/constants'
import { mkdirRecursive } from '../../shared/mkdirRecursive'
import { parseJsonFile } from '../../shared/parseFile'
import { getRpcsByStatus } from '../../shared/rpcHealth'
import { DotNetworkMetadataExtractsFileSchema } from '../../shared/schemas/DotNetworkMetadataExtract'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { type DtaoTokenLogo, DtaoTokenLogosFileSchema } from '../../shared/schemas/DtaoTokenLogoCache'
import { withTimeout } from '../../shared/withTimeout'
import { writeJsonFile } from '../../shared/writeFile'

/** Subnet logos are only mirrored for these networks, bittensor-testnet has 500+ mostly junk subnets */
const DTAO_LOGO_NETWORK_IDS = ['bittensor']

const LOGO_SIZE = 256
const MAX_LOGO_BYTES = 5_000_000
const MAX_LOGO_PIXELS = 50_000_000
const MAX_REDIRECTS = 5
const DOWNLOAD_TIMEOUT = 15_000

/** github html pages arent images, the raw host serves the actual file */
const GITHUB_BLOB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/

/** files matching this pattern are owned by this step, anything else in the folder is manually curated */
const managedLogoFile = (networkId: string) => new RegExp(`^${networkId}-sn\\d+-[0-9a-f]{8}\\.webp$`)

const managedLogoPath = (filename: string) => `./${path.join(DIR_ASSETS_TOKENS_DTAO, filename)}`

type SubnetLogoUrl = { netuid: number; url: string }

/**
 * Mirrors the logo each bittensor subnet publishes on chain (SubnetInfoRuntimeApi.get_all_dynamic_info),
 * so dtao tokens dont depend on coingecko for their icon.
 */
export const fetchDtaoTokensLogos = async () => {
  const metadataExtracts = parseJsonFile(FILE_NETWORKS_METADATA_EXTRACTS_POLKADOT, DotNetworkMetadataExtractsFileSchema)
  const prevLogos = parseJsonFile(FILE_DTAO_TOKEN_LOGOS_CACHE, DtaoTokenLogosFileSchema)

  await mkdirRecursive(DIR_ASSETS_TOKENS_DTAO)

  const logos: DtaoTokenLogo[] = []
  const failures: string[] = []

  for (const networkId of DTAO_LOGO_NETWORK_IDS) {
    const prevNetworkLogos = prevLogos.filter((logo) => logo.networkId === networkId)

    try {
      const miniMetadata = Object.values(metadataExtracts.find(({ id }) => id === networkId)?.miniMetadatas ?? {}).find(
        (miniMetadata) => miniMetadata?.source === 'substrate-dtao' && miniMetadata.data,
      )
      if (!miniMetadata?.data) throw new Error('No substrate-dtao miniMetadata available')

      const rpcs = getRpcsByStatus(networkId, 'polkadot', 'OK')
      if (!rpcs.length) throw new Error('No healthy rpcs available')

      const subnetLogoUrls = await withTimeout(
        () => fetchSubnetLogoUrls(rpcs, miniMetadata.data as `0x${string}`),
        30_000,
        `Failed to fetch subnet identities for ${networkId}`,
      )

      const failuresBefore = failures.length

      const { results } = await PromisePool.withConcurrency(8)
        .for(subnetLogoUrls)
        .process(async ({ netuid, url }) => {
          const prev = prevNetworkLogos.find((logo) => logo.netuid === netuid)

          try {
            return await fetchSubnetLogo(networkId, netuid, url, prev)
          } catch (cause) {
            failures.push(`sn${netuid} ${url} : ${(cause as Error).message}`)

            // a rate limit or a flaky host must not drop a logo that was downloaded successfully before
            return prev && existsSync(prev.path) ? prev : undefined
          }
        })

      const networkLogos = results.filter((logo): logo is DtaoTokenLogo => !!logo)

      logos.push(...networkLogos)

      await deleteStaleLogos(
        networkId,
        networkLogos.map((logo) => logo.path),
      )

      const downloads = networkLogos.filter(
        (logo) => !prevNetworkLogos.some((prev) => prev.netuid === logo.netuid && prev.hash === logo.hash),
      ).length

      console.log(
        'fetchDtaoTokensLogos %s: %s subnets with a logo url (updated:%s unchanged:%s failed:%s)',
        networkId,
        subnetLogoUrls.length,
        downloads,
        networkLogos.length - downloads,
        failures.length - failuresBefore,
      )
    } catch (cause) {
      // keep the previous logos rather than wiping this network's assets on a transient failure
      logos.push(...prevNetworkLogos)
      console.warn('Failed to fetch dtao logos for %s: %s', networkId, (cause as Error).message)
    }
  }

  if (failures.length) console.log('Failed to fetch %s dtao subnet logos:\n%s', failures.length, failures.join('\n'))

  // networks we dont manage keep their entries untouched
  logos.push(...prevLogos.filter((logo) => !DTAO_LOGO_NETWORK_IDS.includes(logo.networkId)))
  logos.sort((a, b) => a.networkId.localeCompare(b.networkId) || a.netuid - b.netuid)

  await writeJsonFile(FILE_DTAO_TOKEN_LOGOS_CACHE, logos, { schema: DtaoTokenLogosFileSchema })

  await updateDotTokensLogos(logos)
}

const fetchSubnetLogoUrls = async (rpcs: string[], metadataRpc: `0x${string}`): Promise<SubnetLogoUrl[]> => {
  const { builder } = parseMetadataRpc(metadataRpc)
  const call = builder.buildRuntimeCall('SubnetInfoRuntimeApi', 'get_all_dynamic_info')

  // low level client, see the comment in fetchDotNetworksSpecs
  const client = createClient(getWsProvider(rpcs))

  try {
    const hex = await client.request<`0x${string}`>('state_call', [
      'SubnetInfoRuntimeApi_get_all_dynamic_info',
      toHex(call.args.enc([])),
    ])

    const infos = call.value.dec(hex) as Array<{
      netuid: number
      subnet_identity?: { logo_url?: Uint8Array } | null
    } | null>

    return infos.flatMap((info) => {
      const url = info && normalizeLogoUrl(info.subnet_identity?.logo_url)
      return url ? [{ netuid: info.netuid, url }] : []
    })
  } finally {
    client.destroy()
  }
}

const normalizeLogoUrl = (bytes: Uint8Array | undefined) => {
  if (!bytes?.length) return undefined

  const value = new TextDecoder().decode(Uint8Array.from(bytes)).trim()
  if (!value) return undefined

  const url = value.replace(GITHUB_BLOB_URL, 'https://raw.githubusercontent.com/$1/$2/$3')

  return isPublicHttpsUrl(url) ? url : undefined
}

/** subnet owners control these urls, they must not be able to aim the runner at its own network */
const isPublicHttpsUrl = (value: string) => {
  try {
    const { protocol, hostname } = new URL(value)
    return protocol === 'https:' && !isPrivateHost(hostname)
  } catch {
    return false
  }
}

const isPrivateHost = (hostname: string) => {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || /^(fc|fd|fe80:)/.test(host)) return true

  const ipv4 = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (!ipv4) return false

  const [a, b] = ipv4.slice(1).map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

/** redirects are followed manually so every hop goes through the same public https check */
const fetchLogo = async (url: string, headers: Record<string, string>) => {
  let target = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
    })

    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    const location = response.headers.get('location')
    if (!location) throw new Error(`HTTP ${response.status} without a location header`)

    target = new URL(location, target).href
    if (!isPublicHttpsUrl(target)) throw new Error(`Redirected to a non public https url (${target})`)
  }

  throw new Error('Too many redirects')
}

const readCappedBody = async (response: Response) => {
  const contentLength = Number(response.headers.get('content-length'))
  if (contentLength > MAX_LOGO_BYTES) throw new Error(`Image is too large (${contentLength} bytes)`)

  const chunks: Uint8Array[] = []
  let size = 0

  // the announced content length is not trustworthy, count the bytes as they arrive
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength
    if (size > MAX_LOGO_BYTES) throw new Error(`Image is too large (over ${MAX_LOGO_BYTES} bytes)`)
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

const fetchSubnetLogo = async (
  networkId: string,
  netuid: number,
  url: string,
  prev: DtaoTokenLogo | undefined,
): Promise<DtaoTokenLogo> => {
  const revalidate = !!prev && prev.url === url && existsSync(prev.path)

  const headers: Record<string, string> = {}
  if (revalidate && prev.etag) headers['If-None-Match'] = prev.etag
  if (revalidate && prev.lastModified) headers['If-Modified-Since'] = prev.lastModified

  const response = await fetchLogo(url, headers)

  if (response.status === 304 && revalidate) return prev

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('text/')) throw new Error(`Not an image (${contentType})`)

  const webp = await toWebp(await readCappedBody(response))

  // content hash in the filename busts the raw.githubusercontent cache when a subnet changes its logo
  const hash = createHash('sha256').update(webp).digest('hex').slice(0, 8)
  const filePath = managedLogoPath(`${networkId}-sn${netuid}-${hash}.webp`)

  if (!existsSync(filePath)) await writeFile(filePath, new Uint8Array(webp))

  // some hosts regenerate their etag or last-modified on every request, keep the cache stable when the image is not
  if (revalidate && prev.hash === hash) return prev

  return {
    networkId,
    netuid,
    url,
    hash,
    path: filePath,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
}

const toWebp = async (buffer: Buffer) => {
  const img = sharp(buffer, { limitInputPixels: MAX_LOGO_PIXELS })
  const metadata = await img.metadata()

  if ((metadata.height ?? 0) > LOGO_SIZE || (metadata.width ?? 0) > LOGO_SIZE)
    img.resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

  return await img.webp().toBuffer()
}

/** deletes the logos of subnets that changed or removed their logo url */
const deleteStaleLogos = async (networkId: string, keepPaths: string[]) => {
  const isManaged = managedLogoFile(networkId)
  const keep = new Set(keepPaths)

  for (const filename of await readdir(DIR_ASSETS_TOKENS_DTAO)) {
    if (!isManaged.test(filename)) continue

    const filePath = managedLogoPath(filename)
    if (!keep.has(filePath)) await unlink(filePath)
  }
}

const updateDotTokensLogos = async (logos: DtaoTokenLogo[]) => {
  const dotTokens = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const logoByToken = new Map(logos.map((logo) => [`${logo.networkId}:${logo.netuid}`, logo.path]))

  for (const token of dotTokens) {
    if (token.type !== 'substrate-dtao') continue
    if (!DTAO_LOGO_NETWORK_IDS.includes(token.networkId)) continue

    // a logo set from the yaml config always wins
    if (token.logo && !managedLogoFile(token.networkId).test(path.basename(token.logo))) continue

    const logo = logoByToken.get(`${token.networkId}:${token.netuid}`)
    if (logo) token.logo = logo
    else delete token.logo
  }

  await writeJsonFile(FILE_DOT_TOKENS_PREBUILD, dotTokens, { schema: DotTokensPreBuildFileSchema })
}
