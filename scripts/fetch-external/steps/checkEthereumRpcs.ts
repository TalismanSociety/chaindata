import uniq from 'lodash/uniq'
import { Hex, hexToNumber } from 'viem'

import { FILE_INPUT_NETWORKS_ETHEREUM, FILE_KNOWN_EVM_NETWORKS, FILE_RPC_HEALTH_ETHEREUM } from '../../shared/constants'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import {
  checkPlatformRpcsHealth,
  getRpcHealthKey,
  getRpcHealthSpecsFromKey,
  getTimeoutSignal,
  RpcHealthSpec,
} from '../../shared/rpcHealth'
import { EthNetworksConfigFileSchema, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { RpcHealth } from '../../shared/schemas/NetworkRpcHealth'

const RPC_TIMEOUT = 4_000 // 4 seconds
const RECHECKS_PER_RUN = 100
const MAX_CHECKS_PER_RUN = 200

export const checkEthereumRpcs = async () => {
  const configNetworks = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownNetworks = parseJsonFile(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)

  const configNetworkKeys = configNetworks.flatMap((network) =>
    (network.rpcs ?? []).map((rpc) => getRpcHealthKey({ networkId: network.id, rpc })),
  )
  const knownNetworkKeys = knownNetworks.flatMap((network) =>
    network.rpcs.map((rpc) => getRpcHealthKey({ networkId: network.id, rpc })),
  )

  const listedRpcs = uniq([...configNetworkKeys, ...knownNetworkKeys]).map(getRpcHealthSpecsFromKey)

  await checkPlatformRpcsHealth(listedRpcs, 'ethereum', getRpcHealth, {
    rechecks: RECHECKS_PER_RUN,
    maxchecks: MAX_CHECKS_PER_RUN,
  })
}

const getRpcHealth = async ({ rpc, networkId }: RpcHealthSpec): Promise<RpcHealth> => {
  // here we want to validate that the RPC works and supports batch requests
  // if unreachable (DNS or SSL error), consider invalid
  // if it doesn't respond, consider unknown as it might be blocking requests from github action runner
  // if it responds, consider valid only if the chainId matches

  const fetchRpcHealth = async (): Promise<RpcHealth> => {
    // use fetch instead of viem to ensure we get proper HTTP errors
    try {
      const request = await fetch(rpc, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify([
          // need to check if the RPC support batch requests
          { id: 0, jsonrpc: '2.0', method: 'eth_chainId' },
          { id: 1, jsonrpc: '2.0', method: 'eth_blockNumber' },
        ]),
        signal: getTimeoutSignal(RPC_TIMEOUT),
      })
      if (!request.ok) {
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
          case 403: // access denied, probably blocking github
          case 522: // timeout, maybe the RPC is ignoring requests from our IP
          case 521: // web server down, maybe temporary downtime
          case 502: // bad gateway, consider host is blocking github
          case 503: // service unavailable, consider host is blocking github or temporary downtime
          case 429: // too many requests
          case 404: // service unavailable, consider host is blocking github or temporary downtime
          case 405: {
            return { status: 'MEH', error }
          }

          default: // unexpected - might be worth investigating
            console.warn(`Unknown HTTP error ${rpc} : ${request.status} - "${request.statusText}"`)
        }
        return { status: 'MEH', error }
      }

      try {
        const response = (await request.json()) as [
          { id: number; jsonrpc: '2.0'; result: Hex },
          { id: number; jsonrpc: '2.0'; result: Hex },
        ]

        if (!Array.isArray(response) || response.length !== 2)
          return { status: 'NOK', error: `RPC doesnt support batch requests` }

        const resChainId = response.find((res) => res.id === 0)
        const resBlockNumber = response.find((res) => res.id === 1)
        if (!resChainId || !resBlockNumber) return { status: 'NOK', error: `Missing info in batch response` }

        const chainId = String(hexToNumber(resChainId.result))
        const isChainIdValid = resChainId.id === 0 && Number(networkId) === Number(chainId)
        if (!isChainIdValid)
          return { status: 'NOK', error: `chainId mismatch: expected ${networkId}, got ${resChainId}` }

        return { status: 'OK' }
      } catch (err) {
        return { status: 'NOK', error: `Failed to fetch chainId: ${(err as Error).message}` }
      }
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'AbortError') {
          return { status: 'MEH', error: `Timeout` }
        }

        return { status: 'NOK', error: `Unexpected DOMException: ${err.message}` }
      } else if (err instanceof Error) {
        if (err.cause) {
          const cause = err.cause as any
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
        const anyError = err as any
        return { status: 'MEH', error: `Unknown error: ${anyError.code ?? anyError.message}` }
      } else return { status: 'MEH', error: `Unknown error: ${(err as any)?.toString()}` }
    }
  }

  const result = await fetchRpcHealth()

  if (result.status !== 'OK') console.log(result.status, rpc, result.error)

  return result
}
