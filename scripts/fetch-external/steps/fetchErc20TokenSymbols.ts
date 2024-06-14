import { readFile, writeFile } from 'node:fs/promises'

import type { EvmErc20Token } from '@talismn/balances'
import prettier from 'prettier'
import { BaseError, ContractFunctionExecutionError, TimeoutError, getContract, hexToString, parseAbi } from 'viem'

import { cleanupString } from '../../shared/cleanupString'
import {
  FILE_EVM_NETWORKS,
  FILE_KNOWN_EVM_ERC20_TOKENS_CACHE,
  FILE_KNOWN_EVM_NETWORKS,
  PRETTIER_CONFIG,
} from '../../shared/constants'
import { ConfigEvmNetwork, Erc20TokenCache } from '../../shared/types'
import { erc20Abi } from '../erc20Abi'
import { getEvmNetworkClient } from '../getEvmNetworkClient'

const IGNORED_TOKENS = [
  { chainId: 1, contractAddress: '0x1da4858ad385cc377165a298cc2ce3fce0c5fd31' },
  { chainId: 1, contractAddress: '0xbdeb4b83251fb146687fa19d1c660f99411eefe3' },
  { chainId: 1, contractAddress: '0xc19b6a4ac7c7cc24459f08984bbd09664af17bd1' },
  { chainId: 1, contractAddress: '0xf8c4a95c92b0d0121d1d20f4575073b37883d663' },
  { chainId: 40, contractAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
  { chainId: 42, contractAddress: '0x5b8b0e44d4719f8a328470dccd3746bfc73d6b14' },
  { chainId: 42, contractAddress: '0x650e14f636295af421d9bb788636356aa7f5924c' },
  { chainId: 42, contractAddress: '0x2db41674f2b882889e5e1bd09a3f3613952bc472' },
  { chainId: 56, contractAddress: '0x3e3b357061103dc040759ac7dceeaba9901043ad' },
  { chainId: 61, contractAddress: '0xd508f85f1511aaec63434e26aeb6d10be0188dc7' },
  { chainId: 137, contractAddress: '0x8af78f0c818302164f73b2365fe152c2d1fe80e1' },
  { chainId: 137, contractAddress: '0xf4bb0ed25ac7bcc9c327b88bac5ca288a08ec41e' },
  { chainId: 137, contractAddress: '0xeb99748e91afca94a6289db3b02e7ef4a8f0a22d' },
  { chainId: 137, contractAddress: '0xe9d2fa815b95a9d087862a09079549f351dab9bd' },
  { chainId: 295, contractAddress: '0x00000000000000000000000000000000001a88b2' },
  { chainId: 295, contractAddress: '0x000000000000000000000000000000000006f89a' },
  { chainId: 295, contractAddress: '0x00000000000000000000000000000000000b2ad5' },
  { chainId: 295, contractAddress: '0x0000000000000000000000000000000000163b5a' },
  { chainId: 295, contractAddress: '0x00000000000000000000000000000000001647e8' },
  { chainId: 295, contractAddress: '0x000000000000000000000000000000000011afa2' },
  { chainId: 295, contractAddress: '0x0000000000000000000000000000000000101ae3' },
  { chainId: 1101, contractAddress: '0x3b6564b5da73a41d3a66e6558a98fd0e9e1e77ad' },
  { chainId: 1101, contractAddress: '0xd4e38eb4a9581e05de8aeb5f895916647b5933f1' },
  { chainId: 1101, contractAddress: '0x0709e962221dd8ac9ec5c56f85ef789d3c1b9776' },
  { chainId: 2222, contractAddress: '0x471ee749bal270eb4c1165b5ad95e614947f6fceb' },
  { chainId: 3693, contractAddress: '0xc84d8d03aa41ef941721a4d77b24bb44d7c7ac55' },
  { chainId: 8453, contractAddress: '0x1b5d3a85ef27a213c73c610352a0912fd7031637' },
  { chainId: 8453, contractAddress: '0xf2d012f604f43e927da3b3576c9c0cafe301428b' },
  { chainId: 39797, contractAddress: '0x709adadd7ba01655ec684c9a74074ec70b023fe9' },
  { chainId: 39797, contractAddress: '0x04cb6ed1d4cef27b2b0d42d628f57ee223d6beee' },
  { chainId: 39797, contractAddress: '0xe19ab0a7f5bf5b243e011bd070cf9e26296f7ebc' },
  { chainId: 39797, contractAddress: '0x8476d1c07cbc7e2dd9e97ffbd9850836835ee7a8' },
  { chainId: 39797, contractAddress: '0x1cca61099dcebe517f8cac58f27218e7aff2d3bf' },
  { chainId: 39797, contractAddress: '0x8b8e6090542b612b7e2d73a934f9f5ea7e9a40af' },
  { chainId: 39797, contractAddress: '0xc588d81d1a9ef1a119446482fc7cbcdb0012292a' },
  { chainId: 39797, contractAddress: '0x8dc6bb6ec3caddefb16b0317fa91217a7df93000' },
  { chainId: 39797, contractAddress: '0x458a9f6a008055fd79f321ea7eb3f83a6cb326e2' },
  { chainId: 39797, contractAddress: '0xc59a4b20ea0f8a7e6e216e7f1b070247520a4514' },
  { chainId: 39797, contractAddress: '0xeeaccbb6ce1b5be68a2cf9d0dea27d4b807848d2' },
  { chainId: 39797, contractAddress: '0x9caa73156981600f4d276a10f80970a171abc1d1' },
  { chainId: 39797, contractAddress: '0xb506a79b296b78965f0a5c15e1474b026c23d9fa' },
  { chainId: 39797, contractAddress: '0x9594e7431144e80178b1bc6849edcba7d2d5bb27' },
  { chainId: 39797, contractAddress: '0x87ce5dde0595d9306db44dc0baa9703ace18c415' },
  { chainId: 39797, contractAddress: '0xf653d401a6af0ec568183d9d0714e3c5e61691d2' },
  { chainId: 39797, contractAddress: '0x8b2ed0247a3fd9706ac033dd7e926161e5c4753b' },
  { chainId: 39797, contractAddress: '0x8bc2b030b299964eefb5e1e0b36991352e56d2d3' },
  { chainId: 42161, contractAddress: '0xafa5676a6ef790f08290dd4a45e0ec2a5cc5cdab' },
  { chainId: 42161, contractAddress: '0xedd6ca8a4202d4a36611e2fff109648c4863ae19' },
  { chainId: 42170, contractAddress: '0xb962150760f9a3bb00e3e9cf48297ee20ada4a33' },
  { chainId: 59144, contractAddress: '0x7e63a5f1a8f0b4d0934b2f2327daed3f6bb2ee75' },
  { chainId: 83872, contractAddress: '0x68db713779f7470c2fd43d3d06841d0192d44939' },
  { chainId: 2046399126, contractAddress: '0xb2a85c5ecea99187a977ac34303b80acbddfa208' },
]

const isCached = (tokenCache: Erc20TokenCache[], chainId: number, contractAddress: string) =>
  tokenCache.some((t) => t.chainId === chainId && t.contractAddress.toLowerCase() === contractAddress.toLowerCase())

const updateTokenCache = async (tokenCache: Erc20TokenCache[], evmNetwork: ConfigEvmNetwork, address: string) => {
  const chainId = Number(evmNetwork.id)

  if (IGNORED_TOKENS.some((t) => t.chainId === chainId && t.contractAddress.toLowerCase() === address.toLowerCase()))
    return

  //cleanup (some entries have some odd suffixes from bad copy paste, ex "0xf025d53bbf98b6b681f7bae9a9083194163e1214#code")
  const contractAddress = address.match(/0x[0-9a-fA-F]{40}/)?.[0]
  if (!contractAddress) return

  if (isCached(tokenCache, chainId, contractAddress)) return

  try {
    const client = getEvmNetworkClient(evmNetwork)
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: erc20Abi,
      publicClient: client,
    })

    let symbol: string
    let decimals: number

    try {
      ;[symbol, decimals] = await Promise.all([contract.read.symbol(), contract.read.decimals()])
    } catch (e) {
      if (e instanceof ContractFunctionExecutionError) {
        // some older tokens have symbol as bytes32, ex 0x0d88ed6e74bbfd96b831231638b66c05571e824f on mainnet
        const erc20BytesAbi = parseAbi([
          'function decimals() view returns (uint8)',
          'function symbol() view returns (bytes32)',
        ] as const)
        const contract = getContract({
          address: contractAddress as `0x${string}`,
          abi: erc20BytesAbi,
          publicClient: client,
        })

        const [symbolBytes, decimals2] = await Promise.all([contract.read.symbol(), contract.read.decimals()])
        decimals = decimals2
        symbol = hexToString(symbolBytes)
      } else {
        throw e
      }
    }

    tokenCache.push({
      chainId,
      contractAddress: contractAddress.toLowerCase(),
      symbol: cleanupString(symbol),
      decimals,
    })
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn('Timeout on network:%s ', evmNetwork.name, evmNetwork.id)
      return null
    }
    const viemError = err as BaseError
    console.warn('Failed to fetch token info', {
      network: `${evmNetwork.name} (${evmNetwork.id})`,
      contractAddress,
      err: viemError.shortMessage ?? viemError.message,
    })
  }
}

export const fetchErc20TokenSymbols = async () => {
  const evmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_EVM_NETWORKS, 'utf-8'))
  const knownEvmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8'))
  const tokensCache: Erc20TokenCache[] = JSON.parse(await readFile(FILE_KNOWN_EVM_ERC20_TOKENS_CACHE, 'utf-8'))

  // NOTE: results in duplicates for some networks, e.g. Ethereum Mainnet
  const allNetworks = knownEvmNetworks.concat(evmNetworks)
  const networksById = Object.fromEntries(allNetworks.map((n) => [n.id, n]))

  // need to dedupe tokens that are registered in both knownEvmTokens and evmTokens
  const tokenDefs = new Set<string>()
  for (const network of allNetworks) {
    const tokens = (network.balancesConfig?.['evm-erc20']?.tokens as EvmErc20Token[]) ?? []
    for (const token of tokens) tokenDefs.add(`${network.id}||${token.contractAddress.toLowerCase()}`)
  }

  const promises = Array.from(tokenDefs)
    .map((td) => {
      const [chainId, contractAddress] = td.split('||')
      const network = networksById[chainId]
      return [network, contractAddress] as const
    })
    .map(([network, contractAddress]) => updateTokenCache(tokensCache, network, contractAddress))

  await Promise.all(promises)

  tokensCache.sort((a, b) => {
    if (a.chainId !== b.chainId) return a.chainId - b.chainId
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol)
    return a.contractAddress.localeCompare(b.contractAddress)
  })

  await writeFile(
    FILE_KNOWN_EVM_ERC20_TOKENS_CACHE,
    await prettier.format(JSON.stringify(tokensCache, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
}
