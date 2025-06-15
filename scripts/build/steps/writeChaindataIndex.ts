// import { getFileList, writeChaindataFile } from '../../shared/util'
// import { sharedData } from './_sharedData'

// export const writeChaindataIndex = async () => {
//   await writeChains()
//   await writeEvmNetworks()
//   await writeTokens()
//   await writeMiniMetadatas()

//   await writeChaindataFile('index.txt', `Chaindata\n#########\n\n${getFileList().slice().sort().join('\n')}\n`)
// }

// const writeChains = async () => {
//   const allChains = sharedData.chains
//     .map((chain) => ({
//       ...chain,
//       // update rpcs list based on fetch-external responsivity tests
//       rpcs: [
//         ...(chain.rpcs?.filter((rpc) => sharedData.rpcHealthWebSocket[rpc.url] === 'OK') ?? []),
//         ...(chain.rpcs?.filter((rpc) => !sharedData.rpcHealthWebSocket[rpc.url]) ?? []), // new rpcs, assume better than MEH
//         ...(chain.rpcs?.filter((rpc) => sharedData.rpcHealthWebSocket[rpc.url] === 'MEH') ?? []),
//         // ...(chain.rpcs?.filter((rpc) => sharedData.substrateRpcsHealth[rpc] === 'NOK') ?? []), // bad rpcs, exclude
//       ],
//     }))
//     .filter((chain) => Array.isArray(chain.rpcs) && chain.rpcs.length > 0)
//     .sort((a, b) => (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER))

//   await writeChaindataFile(`chains/all.json`, JSON.stringify(allChains, null, 2))
//   await writeChaindataFile(
//     `chains/summary.json`,
//     JSON.stringify(
//       allChains.map(({ id, isTestnet, sortIndex, genesisHash, name, themeColor, logo, specName, specVersion }) => ({
//         id,
//         isTestnet,
//         sortIndex,
//         genesisHash,
//         name,
//         themeColor,
//         logo,
//         specName,
//         specVersion,
//       })),
//       null,
//       2,
//     ),
//   )

//   for (const chain of allChains) {
//     if (typeof chain.id !== 'string') continue
//     await writeChaindataFile(`chains/byId/${chain.id}.json`, JSON.stringify(chain, null, 2))

//     if (typeof chain.genesisHash !== 'string') continue
//     await writeChaindataFile(`chains/byGenesisHash/${chain.genesisHash}.json`, JSON.stringify(chain, null, 2))
//   }
// }

// const writeEvmNetworks = async () => {
//   const allEvmNetworks = sharedData.evmNetworks
//     .filter((evmNetwork) => Array.isArray(evmNetwork.rpcs) && evmNetwork.rpcs.length > 0)
//     .sort((a, b) => (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER))

//   await writeChaindataFile(`evmNetworks/all.json`, JSON.stringify(allEvmNetworks, null, 2))
//   await writeChaindataFile(
//     `evmNetworks/summary.json`,
//     JSON.stringify(
//       allEvmNetworks.map(
//         ({ id, isTestnet, sortIndex, name, themeColor, logo, feeType, erc20aggregator, l2FeeType }) => ({
//           id,
//           isTestnet,
//           sortIndex,
//           name,
//           themeColor,
//           logo,
//           feeType,
//           l2FeeType,
//           erc20aggregator,
//         }),
//       ),
//       null,
//       2,
//     ),
//   )

//   for (const evmNetwork of allEvmNetworks) {
//     if (typeof evmNetwork.id !== 'string') continue
//     await writeChaindataFile(`evmNetworks/byId/${evmNetwork.id}.json`, JSON.stringify(evmNetwork, null, 2))
//   }
// }

// const writeTokens = async () => {
//   const allTokens = sharedData.tokens.sort((a, b) => a.id.localeCompare(b.id))

//   await writeChaindataFile(`tokens/all.json`, JSON.stringify(allTokens, null, 2))
//   await writeChaindataFile(
//     `tokens/summary.json`,
//     JSON.stringify(
//       allTokens.map(({ id, isTestnet, type, symbol, decimals, logo }) => ({
//         id,
//         isTestnet,
//         type,
//         symbol,
//         decimals,
//         logo,
//       })),
//       null,
//       2,
//     ),
//   )

//   for (const token of allTokens) {
//     if (typeof token.id !== 'string') continue
//     await writeChaindataFile(`tokens/byId/${token.id}.json`, JSON.stringify(token, null, 2))
//   }
// }

// const writeMiniMetadatas = async () => {
//   const allMiniMetadatas = sharedData.miniMetadatas.sort((a, b) => a.chainId.localeCompare(b.chainId))

//   await writeChaindataFile(`miniMetadatas/all.json`, JSON.stringify(allMiniMetadatas, null, 2))
//   await writeChaindataFile(
//     `miniMetadatas/summary.json`,
//     JSON.stringify(
//       allMiniMetadatas.map(({ id, chainId, source, version, specName, specVersion, balancesConfig }) => ({
//         id,
//         chainId,
//         source,
//         version,
//         specName,
//         specVersion,
//         balancesConfig,
//       })),
//       null,
//       2,
//     ),
//   )

//   for (const miniMetadata of allMiniMetadatas) {
//     if (typeof miniMetadata.id !== 'string') continue
//     await writeChaindataFile(`miniMetadatas/byId/${miniMetadata.id}.json`, JSON.stringify(miniMetadata, null, 2))
//   }
// }
