import { EvmErc20TokenConfig } from '@talismn/balances'
import { z } from 'zod/v4'

import { FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { gql } from '../../shared/gql'
import { parseJsonFile } from '../../shared/parseFile'
import { EthNetworkConfig, KnownEthNetworkConfigSchema, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { writeJsonFile } from '../../shared/writeFile'

const VANA_SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/vana/main/gn'

const dataLiquidityPoolsWithTokenQuery = gql`
  {
    dlps(where: { token_not: null }) {
      name
      iconUrl
      token
    }
  }
`

export const fetchVanaVrc20Tokens = async () => {
  const data = await gqlFetch<{
    dlps?: Array<{ name?: string | null; iconUrl?: string | null; token: string | null }> | null
  }>(VANA_SUBGRAPH_URL, dataLiquidityPoolsWithTokenQuery)
  const tokens: Array<EvmErc20TokenConfig> = (data?.dlps ?? [])
    .map((dataLiquidityPool) => ({
      name: dataLiquidityPool.name ?? undefined,
      logo: validTokenUrl(dataLiquidityPool.iconUrl) ? dataLiquidityPool.iconUrl : undefined,
      contractAddress: validAddress(dataLiquidityPool.token) ? dataLiquidityPool.token : undefined,
    }))
    .filter((token): token is typeof token & { contractAddress: string } => !!token.contractAddress)

  const knownEvmNetworks = parseJsonFile<EthNetworkConfig[]>(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)
  const vanaIndex = knownEvmNetworks.findIndex(({ id }) => id === '1480')
  if (!vanaIndex) return void console.warn('Unable to find Vana with id 1480')

  const vana = knownEvmNetworks[vanaIndex]
  if (!vana.tokens) vana.tokens = {}
  if (!vana.tokens['evm-erc20']) vana.tokens['evm-erc20'] = []

  for (const token of tokens) {
    const existingIndex = vana.tokens['evm-erc20'].findIndex(
      (existing) => existing.contractAddress === token.contractAddress,
    )
    if (existingIndex !== -1) vana.tokens['evm-erc20'].splice(existingIndex, 1)
    vana.tokens['evm-erc20'].push(token)
  }
  vana.tokens['evm-erc20'].sort((a, b) => a.contractAddress.localeCompare(b.contractAddress))

  validateNetwork(vana, KnownEthNetworkConfigSchema)

  const validNetworks = knownEvmNetworks.sort((a, b) => Number(a.id) - Number(b.id))
  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, validNetworks, { schema: KnownEthNetworksFileSchema })
}

const gqlFetch = async <T>(url: string, query: string) =>
  (
    (await (
      await fetch(VANA_SUBGRAPH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
    ).json()) as { data?: T | null }
  )?.data

const validTokenUrl = (tokenUrl?: string | null): tokenUrl is string =>
  typeof tokenUrl === 'string' && (tokenUrl.endsWith('.svg') || tokenUrl.endsWith('.png'))

const validAddress = (address?: string | null): address is `0x${string}` =>
  typeof address === 'string' && address.startsWith('0x')

const validateNetwork = (network: { id: string }, networkSchema: z.ZodType<any>) => {
  const parsable = networkSchema.safeParse(network)
  if (!parsable.success) {
    console.error(parsable.error.message, { issues: parsable.error.issues, network })
    throw new Error(`Failed to parse network "${network.id}"`)
  }
}
