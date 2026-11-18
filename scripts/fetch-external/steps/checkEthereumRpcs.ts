import uniq from 'lodash/uniq'
import { type Hex, hexToNumber } from 'viem'

import type { RpcHealth } from '../../shared/schemas/NetworkRpcHealth'
import { FILE_INPUT_NETWORKS_ETHEREUM, FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { postJsonRpc } from '../../shared/httpRpcHealth'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import {
  checkPlatformRpcsHealth,
  getRpcHealthKey,
  getRpcHealthSpecsFromKey,
  type RpcHealthSpec,
} from '../../shared/rpcHealth'
import { EthNetworksConfigFileSchema, KnownEthNetworksFileSchema } from '../../shared/schemas'

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
    const res = await postJsonRpc(
      { rpc, networkId },
      [
        // need to check if the RPC support batch requests
        { id: 0, jsonrpc: '2.0', method: 'eth_chainId' },
        { id: 1, jsonrpc: '2.0', method: 'eth_blockNumber' },
      ],
      RPC_TIMEOUT,
    )
    if ('health' in res) return res.health

    try {
      const response = (await res.response.json()) as [
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
      if (!isChainIdValid) return { status: 'NOK', error: `chainId mismatch: expected ${networkId}, got ${resChainId}` }

      return { status: 'OK' }
    } catch (err) {
      return { status: 'NOK', error: `Failed to fetch chainId: ${(err as Error).message}` }
    }
  }

  const result = await fetchRpcHealth()

  if (result.status !== 'OK') console.log(result.status, rpc, result.error)

  return result
}
