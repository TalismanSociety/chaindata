import type { Chaindata } from '@talismn/chaindata-provider'
import { PromisePool } from '@supercharge/promise-pool'
import { createPublicClient, fallback, http, isAddress } from 'viem'

import { FILE_OUTPUT_CHAINDATA } from './shared/constants'
import { parseJsonFile } from './shared/parseFile'

const RPC_TIMEOUT = 5_000
const NETWORKS_CONCURRENCY = 5

const getDeployerAddress = () => {
  const args = process.argv.slice(2)
  const flagIndex = args.findIndex((arg) => arg === '--deployer' || arg.startsWith('--deployer='))
  const flagValue = flagIndex === -1 ? undefined : (args[flagIndex].split('=')[1] ?? args[flagIndex + 1])

  const address = flagValue ?? process.env.DEPLOYER_ADDRESS
  if (!address) throw new Error('Deployer address required: use --deployer flag or DEPLOYER_ADDRESS env variable')
  if (!isAddress(address)) throw new Error(`Invalid deployer address: ${address}`)

  return address
}

const getDeployerHasBalance = async (rpcs: string[], deployer: `0x${string}`) => {
  if (!rpcs.length) return 'no rpc'

  try {
    const client = createPublicClient({
      transport: fallback(rpcs.map((rpc) => http(rpc, { timeout: RPC_TIMEOUT, retryCount: 0 }))),
    })
    const balance = await client.getBalance({ address: deployer })
    return balance > 0n ? 'YES' : ''
  } catch {
    return 'unknown'
  }
}

const deployer = getDeployerAddress()
console.log('deployer: %s', deployer)

const chaindata = parseJsonFile<Chaindata>(FILE_OUTPUT_CHAINDATA)
const evmNetworks = chaindata.networks.filter((n) => n.platform === 'ethereum')
const erc20Tokens = chaindata.tokens.filter((n) => n.type === 'evm-erc20')

console.log('%d networks', evmNetworks.length)

const networksWithTokens = evmNetworks
  .map((network) => ({ network, tokens: erc20Tokens.filter((t) => t.networkId === network.id).length }))
  .filter(({ tokens }) => tokens)

const { results } = await PromisePool.withConcurrency(NETWORKS_CONCURRENCY)
  .for(networksWithTokens)
  .onTaskFinished((_, pool) => {
    process.stdout.write(`\rchecking deployer balances: ${pool.processedCount()}/${networksWithTokens.length}`)
  })
  .process(async ({ network, tokens }) => {
    const { id, name, isDefault, forceScan } = network

    // if default or forcescan, need an aggregator because of Asset Discovery in the wallet
    const needed = isDefault || forceScan ? 'YES' : ''

    return {
      id,
      name,
      tokens,
      erc20Aggregator: network.contracts?.Erc20Aggregator,
      needed,
      deployerFunded: await getDeployerHasBalance(network.rpcs ?? [], deployer),
    }
  })

process.stdout.write('\n')

console.table(results.sort((a, b) => b.tokens - a.tokens))
