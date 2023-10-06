import { writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { EthereumListsChain, TalismanEvmNetwork } from '../types'

const isValidRpc = (rpc: string) => rpc.startsWith('https://') && !rpc.includes('${')
const isActiveChain = (chain: EthereumListsChain) => !chain.status || chain.status !== 'deprecated'

export const fetchKnownEvmNetworks = async () => {
  const response = await fetch('https://chainid.network/chains.json')
  const chainsList = (await response.json()) as Array<EthereumListsChain>

  // TODO for debugging only, remove when ready
  await writeFile(
    'dist/chains.json',
    await prettier.format(JSON.stringify(chainsList, null, 2), {
      parser: 'json',
    }),
  )

  const knownEvmNetworks = chainsList
    .filter((chain) => chain.chainId)
    .filter(isActiveChain)
    .filter((chain) => chain.rpc.filter(isValidRpc).length)
    .map((chain) => {
      const evmNetwork: TalismanEvmNetwork = {
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

      if (chain.faucets.length || chain.name.toLocaleLowerCase().includes('testnet')) evmNetwork.isTestNet = true

      return evmNetwork
    })

  await writeFile(
    'known-evm-networks.json',
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
