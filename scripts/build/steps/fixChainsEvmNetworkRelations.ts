import { sharedData } from './_sharedData'

export const fixChainEvmNetworkRelations = async () => {
  const { chains, evmNetworks } = sharedData

  // fix Chain.evmNetworks
  evmNetworks.forEach((evmNetwork) => {
    if (!evmNetwork.substrateChain?.id) return

    const chain = chains.find(({ id }) => id === evmNetwork.substrateChain!.id)
    if (!chain) return

    if (chain.evmNetworks.some(({ id }) => id === evmNetwork.id)) return
    chain.evmNetworks.push({ id: evmNetwork.id })
  })

  // fix Chain.parathreads
  chains.forEach((chain) => {
    if (!chain.relay?.id) return

    const relay = chains.find(({ id }) => id === chain.relay?.id)
    if (!relay) return

    if (!Array.isArray(relay.parathreads)) relay.parathreads = []
    if (relay.parathreads.some(({ id }) => id === chain.id)) return
    relay.parathreads.push({ id: chain.id, paraId: chain.paraId, name: chain.name })
  })
}
