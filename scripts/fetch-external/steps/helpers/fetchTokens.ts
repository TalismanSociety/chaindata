// import { WsProvider } from '@polkadot/rpc-provider'
// import { ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types'
// import { defaultBalanceModules, deriveMiniMetadataId, MiniMetadata } from '@talismn/balances'
// import { ChainConnector } from '@talismn/chain-connector'
// import { ChainConnectorEvm } from '@talismn/chain-connector-evm'
// import {
//   ChaindataProvider,
//   ChainId,
//   DotNetwork,
//   EvmNetworkId,
//   IChaindataProvider,
//   Network,
//   TokenId,
// } from '@talismn/chaindata-provider'
// import { from, of } from 'rxjs'

// import { BALANCES_LIB_VERSION, RPC_REQUEST_TIMEOUT } from '../../../shared/constants'
// import { DotNetworkConfig, DotNetworkSpecs } from '../../../shared/schemas'
// import { DotNetworkMetadataExtract } from '../../../shared/schemas/DotNetworkMetadataExtract'
// import { withTimeout } from '../../../shared/util'
// import { getHackedBalanceModuleDeps } from './getHackedBalanceModuleDeps'

// const libVersion = BALANCES_LIB_VERSION

// export const fetchDotTokensFromMiniMetadata = async (
//   network: DotNetworkConfig,
//   networkSpecs: DotNetworkSpecs,
//   provider: WsProvider,
//   miniMetadatas: DotNetworkMetadataExtract['miniMetadatas'],
// ) => {
//   // TODO: Remove this hack
//   //
//   // We don't actually have the derived `Chain` at this point, only the `ConfigChain`.
//   // But the module only needs access to the `isTestnet` value of the `Chain`, which we do already have.
//   //
//   // So, we will provide the `isTestnet` value using a hacked together `ChaindataProvider` interface.
//   //
//   // But if the balance module tries to access any other `ChaindataProvider` features with our hacked-together
//   // implementation, it will throw an error. This is fine.
//   const { chainConnectors, stubChaindataProvider } = getHackedBalanceModuleDeps(network, provider)

//   // const miniMetadatas: Record<string, MiniMetadata> = {}
//   const tokens: Record<string, any> = {}

//   for (const mod of defaultBalanceModules
//     .map((mod) => mod({ chainConnectors, chaindataProvider: stubChaindataProvider as unknown as ChaindataProvider }))
//     .filter((mod) => mod.type.startsWith('substrate-'))) {
//     const source = mod.type as keyof DotNetworkConfig['balancesConfig']
//     const chainId = network.id

//     const { specVersion } = networkSpecs.runtimeVersion

//     const miniMetadataId = deriveMiniMetadataId({
//       source,
//       chainId,
//       specVersion,
//       libVersion,
//     })

//     const miniMetadata = miniMetadatas[miniMetadataId]

//     if (!miniMetadata) {
//       console.warn('MiniMetadata not found for network %s and module %s, skipping fetchDotTokens', network.id, source)
//       continue
//     }

//     const chainMeta = {
//       data: miniMetadata.data,
//       extra: miniMetadata.extra,
//     }

//     const moduleTokens = await mod.fetchSubstrateChainTokens(
//       network.id,
//       chainMeta as never, // ??
//       network.balancesConfig?.[source],
//       network.tokens?.[source],
//     )
//     Object.assign(tokens, moduleTokens)
//   }

//   return tokens
// }
