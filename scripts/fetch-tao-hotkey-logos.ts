import { createHash } from 'node:crypto'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getSs58AddressInfo } from '@polkadot-api/substrate-bindings'
import { PromisePool } from '@supercharge/promise-pool'
import { decAnyMetadata, getDynamicBuilder, getLookupFn, unifyMetadata } from '@talismn/scale'

import { connectFastestWithMetadata, type DotClient } from './shared/connectFastestWithMetadata'
import { DIR_ASSETS_BITTENSOR_HOTKEYS, FILE_TAO_HOTKEY_LOGOS } from './shared/constants'
import { logDuration } from './shared/logDuration'
import { fetchLogo, normalizeLogoUrl, readCappedBody, toWebp } from './shared/mirrorLogo'
import { mkdirRecursive } from './shared/mkdirRecursive'
import { getRpcsByStatus } from './shared/rpcHealth'
import { TaoHotkeyLogosFileSchema } from './shared/schemas/TaoHotkeyLogos'
import { withTimeout } from './shared/withTimeout'
import { writeJsonFile } from './shared/writeFile'

const NETWORK_ID = 'bittensor'
const LOGO_SIZE = 128
const KEYS_PAGE_SIZE = 1000
const STORAGE_BATCH_SIZE = 500
const SCAN_TIMEOUT = 60_000

type StorageChangeSet = { block: string; changes: Array<[string, string | null]> }

type DelegateLogos = {
  delegates: number
  identities: number
  coldkeyByHotkey: Map<string, string>
  urlByColdkey: Map<string, string>
}

const logoFilename = (coldkey: string) => `${coldkey}.webp`
const logoPath = (filename: string) => path.join(DIR_ASSETS_BITTENSOR_HOTKEYS, filename)
const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

/** stops on an empty page rather than a short one, some rpcs cap the page size below the requested count */
const getAllKeys = async (client: DotClient, prefix: string) => {
  const keys: string[] = []
  let page: string[]

  do {
    page = await client.request<string[]>('state_getKeysPaged', [prefix, KEYS_PAGE_SIZE, keys.at(-1) ?? null])
    keys.push(...page)
  } while (page.length > 0)

  return keys
}

/** returns the [key, value] pairs of the keys that hold a value */
const queryStorage = async (client: DotClient, keys: string[]) => {
  const entries: Array<[string, string]> = []

  for (let i = 0; i < keys.length; i += STORAGE_BATCH_SIZE) {
    const [changeSet] = await client.request<StorageChangeSet[]>('state_queryStorageAt', [
      keys.slice(i, i + STORAGE_BATCH_SIZE),
    ])
    // an empty response would read as "no values" and get every mirrored logo deleted
    if (!changeSet) throw new Error('Empty state_queryStorageAt response')
    for (const [key, value] of changeSet.changes) if (value) entries.push([key, value])
  }

  return entries
}

/** file names are built from the decoded addresses, a change of ss58 prefix would rename every logo */
const assertSs58Prefix42 = (address: string) => {
  const info = getSs58AddressInfo(address)
  if (!info.isValid || info.ss58Format !== 42) throw new Error(`Unexpected hotkey encoding (${address})`)
}

const scanDelegateLogos = async (): Promise<DelegateLogos> => {
  const rpcs = getRpcsByStatus(NETWORK_ID, 'polkadot', 'OK')
  if (!rpcs.length) throw new Error('No healthy rpcs available')

  const { client, metadataRpc } = await connectFastestWithMetadata(rpcs)

  try {
    const builder = getDynamicBuilder(getLookupFn(unifyMetadata(decAnyMetadata(metadataRpc))))
    const delegates = builder.buildStorage('SubtensorModule', 'Delegates')
    const owner = builder.buildStorage('SubtensorModule', 'Owner')
    const identities = builder.buildStorage('SubtensorModule', 'IdentitiesV2')

    const hotkeys = (await getAllKeys(client, delegates.keys.enc())).map((key) => delegates.keys.dec(key)[0] as string)
    if (!hotkeys.length) throw new Error('No delegates found')
    assertSs58Prefix42(hotkeys[0])

    const ownerEntries = await queryStorage(
      client,
      hotkeys.map((hotkey) => owner.keys.enc(hotkey)),
    )

    const coldkeyByHotkey = new Map<string, string>()
    for (const [key, value] of ownerEntries)
      coldkeyByHotkey.set(owner.keys.dec(key)[0] as string, owner.value.dec(value) as string)

    const coldkeys = [...new Set(coldkeyByHotkey.values())]
    const identityEntries = await queryStorage(
      client,
      coldkeys.map((coldkey) => identities.keys.enc(coldkey)),
    )

    const urlByColdkey = new Map<string, string>()
    for (const [key, value] of identityEntries) {
      const { image } = identities.value.dec(value) as { image?: Uint8Array }
      const url = normalizeLogoUrl(image)
      if (url) urlByColdkey.set(identities.keys.dec(key)[0] as string, url)
    }

    return { delegates: hotkeys.length, identities: identityEntries.length, coldkeyByHotkey, urlByColdkey }
  } finally {
    client.destroy()
  }
}

/** undici hides the network error (dns, tls, reset) behind a generic "fetch failed" */
const describeError = (cause: unknown) => {
  const { message, cause: inner } = cause as Partial<Error & { cause?: Partial<Error> }>
  if (!message) return String(cause)
  return inner?.message ? `${message} (${inner.message})` : message
}

const downloadLogo = async (url: string) => {
  const response = await fetchLogo(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('text/')) throw new Error(`Not an image (${contentType})`)

  return toWebp(await readCappedBody(response), LOGO_SIZE)
}

const mirrorDelegateLogos = async ({ delegates, identities, coldkeyByHotkey, urlByColdkey }: DelegateLogos) => {
  await mkdirRecursive(DIR_ASSETS_BITTENSOR_HOTKEYS)

  const urls = [...new Set(urlByColdkey.values())]
  const webpByUrl = new Map<string, Buffer>()
  const failures: string[] = []

  await PromisePool.withConcurrency(8)
    .for(urls)
    .process(async (url) => {
      try {
        webpByUrl.set(url, await downloadLogo(url))
      } catch (cause) {
        failures.push(`${url} : ${describeError(cause)}`)
      }
    })

  const existingFiles = new Set(
    (await readdir(DIR_ASSETS_BITTENSOR_HOTKEYS)).filter((filename) => filename.endsWith('.webp')),
  )
  const keepFiles = new Set<string>()
  let written = 0
  let unchanged = 0

  for (const [coldkey, url] of urlByColdkey) {
    const filename = logoFilename(coldkey)
    const webp = webpByUrl.get(url)

    // a rate limit or a flaky host must not drop a logo that was mirrored successfully before
    if (!webp) {
      if (existingFiles.has(filename)) keepFiles.add(filename)
      continue
    }

    keepFiles.add(filename)

    if (existingFiles.has(filename) && sha256(await readFile(logoPath(filename))) === sha256(webp)) {
      unchanged++
      continue
    }

    await writeFile(logoPath(filename), new Uint8Array(webp))
    written++
  }

  let deleted = 0
  for (const filename of existingFiles) {
    if (keepFiles.has(filename)) continue
    await unlink(logoPath(filename))
    deleted++
  }

  const logos: Record<string, string> = {}
  for (const [hotkey, coldkey] of [...coldkeyByHotkey].sort(([a], [b]) => a.localeCompare(b))) {
    const filename = logoFilename(coldkey)
    if (keepFiles.has(filename)) logos[hotkey] = filename
  }

  await writeJsonFile(FILE_TAO_HOTKEY_LOGOS, logos, { schema: TaoHotkeyLogosFileSchema })

  console.log(
    'fetchTaoHotkeyLogos: delegates:%s identities:%s urls:%s written:%s unchanged:%s deleted:%s failed:%s',
    delegates,
    identities,
    urls.length,
    written,
    unchanged,
    deleted,
    failures.length,
  )
  if (failures.length) console.log('Failed to fetch %s tao hotkey logos:\n%s', failures.length, failures.join('\n'))
}

const stop = logDuration('fetch-tao-hotkey-logos')

let scan: DelegateLogos
try {
  scan = await withTimeout(scanDelegateLogos, SCAN_TIMEOUT, 'Failed to scan bittensor delegates')
} catch (cause) {
  // keep the previous logos rather than wiping the folder on a transient failure
  console.warn('Skipping tao hotkey logos update: %s', (cause as Error).message)
  process.exit(0)
}

await mirrorDelegateLogos(scan)

stop()

process.exit(0)
