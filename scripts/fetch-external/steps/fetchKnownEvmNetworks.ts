import { readFile, writeFile } from 'node:fs/promises'

import { PromisePool } from '@supercharge/promise-pool'
import prettier from 'prettier'
import { Hex, hexToNumber } from 'viem'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE } from '../../shared/constants'
import { ConfigEvmNetwork, EthereumListsChain, EvmNetworkRpcCache, EvmNetworkRpcStatus } from '../../shared/types'

const RPC_TIMEOUT = 4_000 // 4 seconds

const DEBUG = false
const DEBUG_LIST: string[] = [
  // put rpc urls that you want to debug here (cache will be ignored)
  // works only if DEBUG = true
]

const isValidRpc = (rpc: string) => {
  if (rpc.includes('${')) return false // contains keys that need to be replaced

  try {
    const url = new URL(rpc)
    if (url.protocol !== 'https:') return false
    if (url.hostname === '127.0.0.1') return false
    if (url.username || url.password) return false // contains credentials
    return true
  } catch {
    // can't parse
    return false
  }
}
const isActiveChain = (chain: EthereumListsChain) => !chain.status || chain.status !== 'deprecated'

const getTimeoutSignal = (ms: number) => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const getRpcStatus = async (rpcUrl: string, chainId: string): Promise<EvmNetworkRpcStatus> => {
  // here we want to validate the RPC exists
  // if unreachable (DNS or SSL error), consider invalid
  // if it doesn't respond, consider VALID - it's probably blocking requests from github action runner
  // if it responds, consider valid if the chainId matches

  // use fetch instead of viem to ensure we get proper HTTP errors
  try {
    const request = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id: 0, jsonrpc: '2.0', method: 'eth_chainId' }),
      signal: getTimeoutSignal(RPC_TIMEOUT),
    })
    if (!request.ok) {
      switch (request.status) {
        case 526: // unreachable (DNS or SSL error)
        case 523: // unreachable (DNS or SSL error)
        case 400: {
          // bad request - (verified that this is not client specific)
          if (DEBUG)
            console.warn(`[invalid] HTTP error ${chainId} ${rpcUrl} : ${request.status} - "${request.statusText}"`)
          return 'invalid'
        }

        case 403: // access denied, probably blocking github
        case 522: // timeout, maybe the RPC is ignoring requests from our IP
        case 521: // web server down, maybe temporary downtime
        case 502: // bad gateway, consider host is blocking github
        case 503: // service unavailable, consider host is blocking github or temporary downtime
        case 429: // too many requests
        case 404: // service unavailable, consider host is blocking github or temporary downtime
        case 405: {
          // not allowed
          if (DEBUG)
            console.warn(`[unknown] HTTP error ${chainId} ${rpcUrl} : ${request.status} - "${request.statusText}"`)
          return 'unknown'
        }

        default: // unexpected, consider valid - might be worth investigating
          console.warn(`Unknown HTTP error ${chainId} ${rpcUrl} : ${request.status} - "${request.statusText}"`)
          return 'unknown'
      }
    }

    try {
      const response = (await request.json()) as { id: number; jsonrpc: '2.0'; result: Hex }
      const resChainId = String(hexToNumber(response.result))
      const isValid = Number(chainId) === Number(resChainId)
      if (!isValid) console.log('chainId mismatch', chainId, rpcUrl, resChainId)

      return isValid ? 'valid' : 'invalid'
    } catch {
      return 'invalid' // parse error
    }
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') {
        if (DEBUG) console.warn(`timeout ${chainId} ${rpcUrl}`)
        return 'unknown' // timeout, might be ignoring github action host requests
      }

      console.warn('unexpected DOMException', chainId, rpcUrl, err)
      return 'unknown'
    } else if (err instanceof Error) {
      if (err.cause) {
        const cause = err.cause as any
        switch (cause.code ?? '') {
          // unreachable or certificate errors
          case 'ENOTFOUND':
          case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          case 'CERT_HAS_EXPIRED':
          case 'ERR_TLS_CERT_ALTNAME_INVALID':
          case 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR':
          case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
          case 'SELF_SIGNED_CERT_IN_CHAIN': {
            if (DEBUG) console.warn(`[invalid] invalid certificate ${chainId} ${rpcUrl} - ${cause.code}`)
            return 'invalid'
          }

          // might just be blocking github action host
          case 'ECONNREFUSED':
          case 'UND_ERR_CONNECT_TIMEOUT':
          case 'ECONNRESET': {
            if (DEBUG) console.warn(`[unknown] connection failed ${chainId} ${rpcUrl} - ${cause.code}`)
            return 'unknown'
          }

          // unexpected, might be worth investigating
          default: {
            if (cause.code) console.warn('unexpected cause error code', chainId, rpcUrl, cause.code)
            else console.warn('unexpected error', chainId, rpcUrl, err)
            break
          }
        }
      }
    } else console.warn('unexpected error', chainId, rpcUrl, err)

    return 'unknown'
  }
}

export const fetchKnownEvmNetworks = async () => {
  const response = await fetch('https://chainid.network/chains.json')
  const chainsList = (await response.json()) as Array<EthereumListsChain>

  const knownEvmNetworks = chainsList
    .filter((chain) => !!chain.chainId)
    .filter(isActiveChain)
    .filter((chain) => chain.rpc.filter(isValidRpc).length)
    .map((chain) => {
      const evmNetwork: ConfigEvmNetwork = {
        id: chain.chainId.toString(),
        name: chain.name,
        rpcs: chain.rpc.filter(isValidRpc),
        icon: chain.icon,
      }

      const explorerUrl = chain.explorers?.[0]?.url
      if (explorerUrl) evmNetwork.explorerUrl = explorerUrl

      if (chain.nativeCurrency) {
        evmNetwork.balancesConfig = {
          'evm-native': {
            symbol: chain.nativeCurrency.symbol,
            decimals: chain.nativeCurrency.decimals,
          },
        }
      }

      if (
        chain.faucets.length ||
        chain.name.toLocaleLowerCase().includes('testnet') ||
        chain.rpc.some((rpc) => rpc.includes('testnet'))
      )
        evmNetwork.isTestnet = true

      return evmNetwork
    })

  const knownEvmNetworksRpcsCache = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE, 'utf-8'),
  ) as EvmNetworkRpcCache[]

  // yeet the 50 oldest entries in cache to force them to be retested
  knownEvmNetworksRpcsCache.sort((a, b) => a.timestamp - b.timestamp)
  if (DEBUG) {
    const itemsToDelete = knownEvmNetworksRpcsCache.filter((c) => DEBUG_LIST.includes(c.rpcUrl))
    for (const item of itemsToDelete) {
      const index = knownEvmNetworksRpcsCache.indexOf(item)
      if (index !== -1) {
        console.log('deleting', item)
        knownEvmNetworksRpcsCache.splice(index, 1)
      }
    }
  } else knownEvmNetworksRpcsCache.splice(0, 50)

  // test RPCs to exclude invalid ones, and prioritize the ones that are confirmed valid
  await PromisePool.withConcurrency(4)
    .for(knownEvmNetworks)
    .process(async (network): Promise<void> => {
      if (!network.rpcs) return

      const statuses: Record<string, EvmNetworkRpcStatus> = Object.fromEntries(
        await Promise.all(
          network.rpcs.map(async (rpcUrl) => {
            const cached = knownEvmNetworksRpcsCache.find((c) => c.chainId === network.id && c.rpcUrl === rpcUrl)
            if (cached) return [rpcUrl, cached.status]

            const status = await getRpcStatus(rpcUrl, network.id)
            knownEvmNetworksRpcsCache.push({ chainId: network.id, rpcUrl, status, timestamp: Date.now() })

            return [rpcUrl, status]
          }),
        ),
      )

      // prioritize valid RPCs over the ones we're not sure about the status
      // and exclude the ones that are invalid for sure
      const arStatuses = Object.entries(statuses)
      network.rpcs = [
        ...arStatuses.filter(([_, status]) => status === 'valid').map(([url]) => url),
        ...arStatuses.filter(([_, status]) => status === 'unknown').map(([url]) => url),
      ]
    })

  // sort by network then by rpc url
  knownEvmNetworksRpcsCache.sort((a, b) =>
    a.chainId !== b.chainId ? Number(a.chainId) - Number(b.chainId) : a.rpcUrl.localeCompare(b.rpcUrl),
  )

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE,
    await prettier.format(JSON.stringify(knownEvmNetworksRpcsCache, null, 2), {
      parser: 'json',
    }),
  )

  // sort but don't filter out networks without RPCs
  // wallet needs their names, icons etc.
  const validNetworks = knownEvmNetworks.sort((a, b) => Number(a.id) - Number(b.id))

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS,
    await prettier.format(JSON.stringify(validNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
