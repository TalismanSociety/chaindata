import sharp from 'sharp'

const MAX_LOGO_BYTES = 5_000_000
const MAX_LOGO_PIXELS = 50_000_000
const MAX_REDIRECTS = 5
const DOWNLOAD_TIMEOUT = 15_000

/** github html pages arent images, the raw host serves the actual file */
const GITHUB_BLOB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/

export const normalizeLogoUrl = (bytes: Uint8Array | undefined) => {
  if (!bytes?.length) return undefined

  const value = new TextDecoder().decode(Uint8Array.from(bytes)).trim()
  if (!value) return undefined

  const url = value.replace(GITHUB_BLOB_URL, 'https://raw.githubusercontent.com/$1/$2/$3')

  return isPublicHttpsUrl(url) ? url : undefined
}

/** third parties control these urls, they must not be able to aim the runner at its own network */
export const isPublicHttpsUrl = (value: string) => {
  try {
    const { protocol, hostname } = new URL(value)
    return protocol === 'https:' && !isPrivateHost(hostname)
  } catch {
    return false
  }
}

export const isPrivateHost = (hostname: string) => {
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
export const fetchLogo = async (url: string, headers: Record<string, string> = {}) => {
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

export const readCappedBody = async (response: Response) => {
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

export const toWebp = async (buffer: Buffer, size: number) => {
  const img = sharp(buffer, { limitInputPixels: MAX_LOGO_PIXELS })
  const metadata = await img.metadata()

  if ((metadata.height ?? 0) > size || (metadata.width ?? 0) > size)
    img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

  return await img.webp().toBuffer()
}
