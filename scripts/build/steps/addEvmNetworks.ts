import { PromisePool } from '@supercharge/promise-pool'
import { EthereumRpc, EvmNetwork as UpstreamEvmNetwork, githubChainLogoUrl } from '@talismn/chaindata-provider'
import axios from 'axios'

import { PROCESS_CONCURRENCY } from '../constants'
import { ConfigEvmNetwork } from '../types'
import { sharedData } from './_sharedData'

// TODO: Switch to the updated type in `@talismn/chaindata`
type EvmNetwork = Omit<UpstreamEvmNetwork, 'rpcs' | 'isHealthy'> & {
  rpcs: Array<Pick<EthereumRpc, 'url'>> | null

  balancesConfig: Array<{ moduleType: string; moduleConfig: unknown }>
  balancesMetadata: Array<{ moduleType: string; metadata: unknown }>
}

export const addEvmNetworks = async () => {
  const isStandaloneEvmNetwork = (evmNetwork: EvmNetwork | ConfigEvmNetwork) =>
    'substrateChain' in evmNetwork
      ? typeof evmNetwork.substrateChain?.id !== 'string'
      : typeof evmNetwork.substrateChainId === 'undefined' && typeof evmNetwork.name !== 'undefined'

  const isSubstrateEvmNetwork = (evmNetwork: EvmNetwork | ConfigEvmNetwork) =>
    'substrateChain' in evmNetwork
      ? typeof evmNetwork.substrateChain?.id === 'string'
      : typeof evmNetwork.substrateChainId !== 'undefined'

  // we don't know most evm network ids until the second step where we look it up on-chain
  //
  // so, this map lets us associate the networks inside `standaloneEvmNetworks`, `substrateEvmNetworks`
  // and `allEvmNetworks` with their related configs in `evmNetworksConfig`
  //
  // this is needed so that we can extract the user-defined theme-color from the github config for each
  // network and associate it with the computed network id for use in other processor steps
  // (namely the addThemeColors step)
  //
  // it uses indexes into these arrays as temporary ids
  //
  // format:
  // {
  //   standalone: Map<array item index inside standaloneEvmNetworks, array item index inside githubEvmNetworks>,
  //   substrate: Map<array item index inside substrateEvmNetworks, array item index inside githubEvmNetworks>,
  //   all: Map<array item index inside allEvmNetworks, array item index inside githubEvmNetworks>,
  // }
  const configsByIndex = {
    standalone: new Map<number, number>(),
    substrate: new Map<number, number>(),
    all: new Map<number, number>(),
  }

  let standaloneIndex = -1
  let substrateIndex = -1

  const standaloneEvmNetworks = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(sharedData.evmNetworksConfig)
      .process(async (configEvmNetwork, configIndex) => {
        if (!isStandaloneEvmNetwork(configEvmNetwork)) return undefined
        standaloneIndex++
        configsByIndex.standalone.set(standaloneIndex, configIndex)

        const evmNetwork: Omit<EvmNetwork, 'id'> & { id: string | null } = {
          id: null,
          isTestnet: configEvmNetwork.isTestnet || false,
          sortIndex: null,
          name: configEvmNetwork.name ?? null,
          themeColor: null,
          logo: null, // the logo is set later, after we determine the chain id
          nativeToken: null,
          tokens: [],
          explorerUrl: configEvmNetwork.explorerUrl ?? null,
          rpcs: (configEvmNetwork.rpcs || []).map((url) => ({ url })),
          substrateChain: null,

          balancesConfig: Object.entries(configEvmNetwork.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
            moduleType,
            moduleConfig,
          })),
          balancesMetadata: [],
        }

        return evmNetwork
      })
  ).results.filter((network): network is EvmNetwork => network !== undefined)

  const substrateEvmNetworks = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(sharedData.evmNetworksConfig)
      .process(async (configEvmNetwork, configIndex) => {
        if (!isSubstrateEvmNetwork(configEvmNetwork)) return
        substrateIndex++
        configsByIndex.substrate.set(substrateIndex, configIndex)

        const substrateChain = sharedData.chains.find((chain) => chain.id === configEvmNetwork.substrateChainId)
        if (!substrateChain) return

        const evmNetwork: Omit<EvmNetwork, 'id'> & { id: string | null } = {
          id: null,
          isTestnet: substrateChain.isTestnet || configEvmNetwork.isTestnet || false,
          sortIndex: null,
          name: configEvmNetwork.name ?? substrateChain.name ?? null,
          themeColor: null,
          logo: substrateChain.logo ?? null, // TODO: Copy chain & token assets into GH Pages output
          nativeToken: null,
          tokens: [],
          explorerUrl: configEvmNetwork.explorerUrl ?? null,
          rpcs: (configEvmNetwork.rpcs || []).map((url) => ({ url })),
          substrateChain: { id: substrateChain.id },

          balancesConfig: Object.entries(configEvmNetwork.balancesConfig ?? {}).map(([moduleType, moduleConfig]) => ({
            moduleType,
            moduleConfig,
          })),
          balancesMetadata: [],
        }

        return evmNetwork
      })
  ).results.filter((network): network is EvmNetwork => network !== undefined)

  let allEvmNetworks = [...standaloneEvmNetworks, ...substrateEvmNetworks]
  for (const [standaloneIndex, configIndex] of configsByIndex.standalone.entries()) {
    const allIndex = standaloneIndex
    configsByIndex.all.set(allIndex, configIndex)
  }
  for (const [substrateIndex, configIndex] of configsByIndex.substrate.entries()) {
    const allIndex = substrateIndex + configsByIndex.substrate.size
    configsByIndex.all.set(allIndex, configIndex)
  }

  // get network ids
  allEvmNetworks = (
    await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
      .for(allEvmNetworks)
      .process(async (evmNetwork, allIndex) => {
        const debugName = evmNetwork.name ?? evmNetwork.substrateChain?.id ?? 'NO NAME OR SUBSTRATE CHAIN ID'
        console.log(`Fetching extras for evmNetwork ${allIndex + 1} of ${allEvmNetworks.length} (${debugName})`)

        const ethereumIds: Array<string | null> = await Promise.all(
          evmNetwork.rpcs?.map?.(async (rpc) => {
            // try to connect to rpc
            try {
              const response = await axios.post(
                rpc.url,
                JSON.stringify({
                  method: 'eth_chainId',
                  params: [],
                  id: 1,
                  jsonrpc: '2.0',
                }),
                {
                  headers: {
                    'Content-Type': 'application/json',
                    // our extension will send this header with every request
                    // some RPCs reject this header
                    // for those that reject, we want the chaindata CI requests to also reject
                    Origin: 'chrome-extension://abpofhpcakjhnpklgodncneklaobppdc',
                  },
                }
              )

              // check response status
              if (response.status !== 200)
                throw new Error(`Non-200 response status (${response.status}) from ethereum rpc`)

              const ethereumId = parseInt(response.data.result)
              if (Number.isNaN(ethereumId))
                throw new Error(`NaN response to eth_chainId: ${JSON.stringify(response.data)}`)

              return ethereumId.toString(10)
            } catch (error) {
              return null
            }
          }) ?? []
        )

        // set id
        if (ethereumIds.filter((id): id is string => id !== null).length > 0) {
          // set id to the first healthy rpc's ethereumId
          evmNetwork.id = ethereumIds.filter((id): id is string => id !== null)[0]

          // remove any rpcs with a different ethereumId
          const deleteRpcs = ethereumIds
            .map((id, rpcIndex) => ({ id, rpcIndex }))
            .filter(({ id }) => {
              if (id === evmNetwork.id) return false
              return true
            })
            .map(({ rpcIndex }) => rpcIndex)

          evmNetwork.rpcs = evmNetwork.rpcs?.filter?.((_, rpcIndex) => !deleteRpcs.includes(rpcIndex)) ?? []
        }

        if (typeof evmNetwork.id !== 'string') return null

        // if standalone, update the logo (which is based on the id)
        if (isStandaloneEvmNetwork(evmNetwork)) evmNetwork.logo = githubChainLogoUrl(evmNetwork.id) // TODO: Copy chain & token assets into GH Pages output

        // set the user-defined theme color (if it exists)
        // used to override the auto-calculated theme color
        const configEvmNetworkIndex = configsByIndex.all.get(allIndex)
        const configEvmNetwork =
          typeof configEvmNetworkIndex === 'number' ? sharedData.evmNetworksConfig[configEvmNetworkIndex] : undefined
        if (typeof configEvmNetwork?.themeColor === 'string')
          sharedData.userDefinedThemeColors.evmNetworks.set(evmNetwork.id, configEvmNetwork.themeColor)

        console.log(`Fetching extras succeeded for evmNetwork ${debugName}`)
        return evmNetwork
      })
  ).results.filter(<T>(evmNetwork: T): evmNetwork is NonNullable<T> => !!evmNetwork)

  sharedData.evmNetworks.push(...(allEvmNetworks as unknown[] as UpstreamEvmNetwork[]))
}
