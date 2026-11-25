import type { RpcHealth } from '../../shared/schemas/NetworkRpcHealth'
import { FILE_INPUT_NETWORKS_SOLANA, FILE_NETWORKS_SPECS_SOLANA } from '../../shared/constants'
import { postJsonRpc } from '../../shared/httpRpcHealth'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { checkPlatformRpcsHealth, type RpcHealthSpec } from '../../shared/rpcHealth'
import { SolNetworkSpecsFileSchema, SolNetworksConfigFileSchema } from '../../shared/schemas'

const RPC_TIMEOUT = 4_000 // 4 seconds
const RECHECKS_PER_RUN = 100
const MAX_CHECKS_PER_RUN = 200

export const checkSolanaRpcs = async () => {
  const networks = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)
  const listedRpcs = networks.flatMap((network) => network.rpcs.map((rpc) => ({ rpc, networkId: network.id })))

  // Known genesis hash per cluster, written by fetchSolNetworksSpecs from RPCs that passed this check.
  // An RPC that answers with a different genesis hash serves another cluster: mark it NOK.
  // Networks with no known genesis yet (new networks) skip the comparison and are validated on connectivity alone.
  const expectedGenesisById = new Map(
    parseJsonFile(FILE_NETWORKS_SPECS_SOLANA, SolNetworkSpecsFileSchema).map((specs) => [specs.id, specs.genesisHash]),
  )

  await checkPlatformRpcsHealth(
    listedRpcs,
    'solana',
    (spec: RpcHealthSpec) => getRpcHealth(spec, expectedGenesisById.get(spec.networkId)),
    {
      rechecks: RECHECKS_PER_RUN,
      maxchecks: MAX_CHECKS_PER_RUN,
    },
  )
}

const getRpcHealth = async (spec: RpcHealthSpec, expectedGenesis: string | undefined): Promise<RpcHealth> => {
  const result = await fetchRpcHealth(spec, expectedGenesis)

  if (result.status !== 'OK') console.log(result.status, spec.rpc, result.error)

  return result
}

const fetchRpcHealth = async (spec: RpcHealthSpec, expectedGenesis: string | undefined): Promise<RpcHealth> => {
  const res = await postJsonRpc(spec, { id: 0, jsonrpc: '2.0', method: 'getGenesisHash' }, RPC_TIMEOUT)
  if ('health' in res) return res.health

  // Only a genesis mismatch is NOK. A JSON-RPC error (rate limit, "Node is behind"), a non-JSON body or a body
  // read that times out can all be temporary: MEH keeps the RPC published while its last pass is recent enough.
  try {
    const response = (await res.response.json()) as { result?: unknown; error?: { message?: string } }

    const genesisHash = response.result
    if (typeof genesisHash !== 'string')
      return { status: 'MEH', error: `No genesis hash in response: ${response.error?.message ?? 'missing result'}` }

    if (expectedGenesis && genesisHash !== expectedGenesis)
      return { status: 'NOK', error: `genesis mismatch (got ${genesisHash}, expected ${expectedGenesis})` }

    return { status: 'OK' }
  } catch (err) {
    return { status: 'MEH', error: `Failed to fetch genesis hash: ${(err as Error).message}` }
  }
}
