import type { RpcHealth } from './schemas/NetworkRpcHealth'
import { getTimeoutSignal, type RpcHealthSpec } from './rpcHealth'

export type JsonRpcPostResult = { response: Response } | { health: RpcHealth }

// Sends a JSON-RPC request over HTTP. Returns the response when the RPC answers with a 2xx status, otherwise the
// health to record for it: NOK when it is unreachable for anyone (DNS or certificate errors, a status that rejects
// the request), MEH when it doesn't respond, as it might be blocking requests from the GitHub Actions runner.
export const postJsonRpc = async (
  { rpc, networkId }: RpcHealthSpec,
  body: unknown,
  timeout: number,
): Promise<JsonRpcPostResult> => {
  // use fetch instead of viem to ensure we get proper HTTP errors
  try {
    const request = await fetch(rpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: getTimeoutSignal(timeout),
    })
    if (!request.ok) return { health: getHttpErrorHealth(rpc, request) }

    return { response: request }
  } catch (err) {
    return { health: getFetchErrorHealth({ rpc, networkId }, err) }
  }
}

const getHttpErrorHealth = (rpc: string, request: Response): RpcHealth => {
  const error = `HTTP ${request.status} - ${request.statusText}`

  switch (request.statusText) {
    case 'HPE_INVALID_HEADER_TOKEN':
    case 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE':
    case 'UND_ERR_SOCKET':
    case 'Method Not Allowed':
    case 'Not Allowed':
    case 'Not Found':
    case 'Unauthorized':
    case 'Bad Request':
    case 'Gone':
    case 'Unprocessable Entity':
      return { status: 'NOK', error }

    case 'Service Unavailable':
    case 'Service Temporarily Unavailable':
    case 'Bad Gateway':
    case 'Forbidden':
      return { status: 'MEH', error }
  }

  switch (request.status) {
    case 526: // unreachable (DNS or SSL error)
    case 525: // unreachable (DNS or SSL error)
    case 523: // unreachable (DNS or SSL error)
    case 972: // unreachable (DNS or SSL error)
    case 530: // frozen
    case 400: // bad request - (verified that this is not client specific)
    case 401: // unauthorized - (verified that this is not client specific)
    case 422: // unprocessable
    case 405: // Method not allowed = doesnt support batch requests
    case 410: {
      return { status: 'NOK', error }
    }

    case 500: // internal server error, consider it's temporary
    case 403: // access denied, probably blocking github
    case 522: // timeout, maybe the RPC is ignoring requests from our IP
    case 521: // web server down, maybe temporary downtime
    case 502: // bad gateway, consider host is blocking github
    case 503: // service unavailable, consider host is blocking github or temporary downtime
    case 429: // too many requests
    case 404: {
      return { status: 'MEH', error }
    }

    default: // unexpected - might be worth investigating
      console.warn(`Unknown HTTP error ${rpc} : ${request.status} - "${request.statusText}"`)
  }
  return { status: 'MEH', error }
}

const getFetchErrorHealth = ({ rpc, networkId }: RpcHealthSpec, err: unknown): RpcHealth => {
  if (err instanceof DOMException) {
    if (err.name === 'AbortError') {
      return { status: 'MEH', error: `Timeout` }
    }

    return { status: 'NOK', error: `Unexpected DOMException: ${err.message}` }
  } else if (err instanceof Error) {
    if (err.cause) {
      const cause = err.cause as { code?: string }
      switch (cause.code ?? '') {
        // unreachable or certificate errors
        case 'ENOTFOUND':
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
        case 'CERT_HAS_EXPIRED':
        case 'ERR_TLS_CERT_ALTNAME_INVALID':
        case 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE':
        case 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR':
        case 'ERR_SSL_TLSV1_UNRECOGNIZED_NAME':
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        case 'SELF_SIGNED_CERT_IN_CHAIN': {
          // if (DEBUG) console.warn(`[invalid] invalid certificate ${chainId} ${rpcUrl} - ${cause.code}`)
          return { status: 'NOK', error: `Invalid certificate: ${cause.code}` }
        }

        // might just be blocking github action host
        case 'ECONNREFUSED':
        case 'UND_ERR_CONNECT_TIMEOUT':
        case 'ECONNRESET': {
          // if (DEBUG) console.warn(`[unknown] connection failed ${chainId} ${rpcUrl} - ${cause.code}`)
          return { status: 'MEH', error: `Connection blocked: ${cause.code}` }
        }

        // unexpected, might be worth investigating
        default: {
          if (cause.code) console.warn('unexpected cause error code', networkId, rpc, cause.code)
          else console.warn('unexpected error', networkId, rpc, err)
          break
        }
      }
    }
    const anyError = err as Error & { code?: string }
    return { status: 'MEH', error: `Unknown error: ${anyError.code ?? anyError.message}` }
  } else return { status: 'MEH', error: `Unknown error: ${String(err)}` }
}
