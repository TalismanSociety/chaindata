#!/usr/bin/env node

const util = require('util')
const fs = require('fs')
const { readFileSync, writeFileSync } = require('fs')
const exec = util.promisify(require('child_process').exec)

// overrides used when looking up via default id (name to lowercase with hyphens) to instead use the network specified at https://raw.githubusercontent.com/paritytech/ss58-registry/main/ss58-registry.json
const ss58IdOverrides = {
  'bifrost-ksm': 'bifrost',
  'bit-country-pioneer': 'pioneer_network',
  'kintsugi-btc': 'kintsugi',
  'parallel-heiko': 'heiko',
  quartz: 'quartz_mainnet',
}

;(async () => {
  const oldManifest = JSON.parse(fs.readFileSync('../chaindata/manifest.json'))

  const chaindata = JSON.parse(fs.readFileSync('./chaindata.json'))
  const ss58Registry = JSON.parse(
    (
      await exec(
        'curl -sL https://raw.githubusercontent.com/paritytech/ss58-registry/main/ss58-registry.json'
      )
    ).stdout
  ).registry

  //
  // update chaindata with data from multi-relay-chain-future for each chain
  //
  for (const [oldChainId, chainName] of Object.entries(oldManifest)) {
    //
    // copy data from multi-relay-chain-future (old chaindata)
    //

    const relayOldId = oldChainId.split('-')[0]
    const paraId = parseInt(oldChainId.split('-')[1])

    const relayId =
      relayOldId === '0' ? 'polkadot' : relayOldId === '2' ? 'kusama' : null

    const oldChain = JSON.parse(
      fs.readFileSync(
        isNaN(paraId)
          ? `../chaindata/${relayOldId}/manifest.json`
          : `../chaindata/${relayOldId}/parathreads/${paraId}/manifest.json`
      )
    )

    if (oldChain.name === undefined) oldChain.name = null
    if (oldChain.nativeToken === undefined || oldChain.nativeToken === '')
      oldChain.nativeToken = null
    if (oldChain.tokenDecimals === undefined) oldChain.tokenDecimals = null

    const id = oldChain.name
      .toLowerCase()
      .replace(/ network$/i, '')
      .replace(/ protocol$/i, '')
      .replace(/ by polkafoundry$/i, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\./g, '-')
      .replace(/ /g, '-')

    let chain = chaindata.find((chain) => {
      if (isNaN(paraId)) return chain.id === relayId
      return chain.relay?.id === relayId && chain.relay?.paraId === paraId
    })

    if (!chain) {
      console.log(`Adding ${id} to chaindata`)
      chaindata.push({
        id,
        prefix: null,
        name: oldChain.name,
        token: oldChain.nativeToken,
        decimals: oldChain.tokenDecimals,
        existentialDeposit: null,
        account: '*25519',
        rpcs: oldChain.rpcs,
        relay: { id: relayId, paraId },
      })

      const relayChain = chaindata.find((chain) => chain.id === relayId)
      if (!relayChain) throw new Error(`relayChain not found ${relayId}`)
      if (
        relayChain &&
        !relayChain.parathreads.some(
          (parathread) => parathread.paraId === paraId
        )
      ) {
        relayChain.parathreads.push({ id, paraId })
        relayChain.parathreads.sort((a, b) => a.paraId - b.paraId)
      }
    }

    chain = chaindata.find((chain) => {
      if (isNaN(paraId)) return chain.id === relayId
      return chain.relay?.id === relayId && chain.relay?.paraId === paraId
    })

    if (chain.id !== id) {
      console.log(`Updating chain id for ${id} from ${chain.id} to ${id}`)
      chain.id = id
      const relayChain = chaindata.find((chain) => chain.id === relayId)
      if (!relayChain) throw new Error(`relayChain not found ${relayId}`)
      const parathread = relayChain.parathreads.find(
        (parathread) => parathread.paraId === paraId
      )
      if (!relayChain)
        throw new Error(`parathread not found ${relayId} ${paraId}`)
      parathread.id = id
    }

    if (chain.name !== oldChain.name) {
      console.log(
        `Updating chain name for ${id} from ${chain.name} to ${oldChain.name}`
      )
      chain.name = oldChain.name
    }

    if (chain.token !== oldChain.nativeToken) {
      console.log(
        `Updating chain token for ${id} from ${chain.token} to ${oldChain.nativeToken}`
      )
      chain.token = oldChain.nativeToken
    }

    if (chain.decimals !== oldChain.tokenDecimals) {
      console.log(
        `Updating chain decimals for ${id} from ${chain.decimals} to ${oldChain.tokenDecimals}`
      )
      chain.decimals = oldChain.tokenDecimals
    }

    if (JSON.stringify(chain.rpcs) !== JSON.stringify(oldChain.rpcs)) {
      console.log(
        `Updating chain rpcs for ${id} from ${JSON.stringify(
          chain.rpcs
        )} to ${JSON.stringify(oldChain.rpcs)}`
      )
      chain.rpcs = oldChain.rpcs
    }

    //
    // copy data from ss58registry
    //

    const ss58Id = ss58IdOverrides[id] ? ss58IdOverrides[id] : id
    const network = ss58Registry.find((network) => network.network === ss58Id)
    if (!network) {
      console.log('---CHAIN NOT FOUND IN SS58REGISTRY--', id, oldChain.name)
      continue
    }

    if (chain.prefix !== network.prefix) {
      console.log(
        `Updating chain prefix for ${id} from ${chain.prefix} to ${network.prefix}`
      )
      chain.prefix = network.prefix
    }

    if (chain.token !== network.symbols[0] || null) {
      console.log(
        `Updating chain token for ${id} from ${chain.token} to ${
          network.symbols[0] || null
        }`
      )
      chain.token = network.symbols[0] || null
    }

    if (chain.decimals !== network.decimals[0] || null) {
      console.log(
        `Updating chain decimals for ${id} from ${chain.decimals} to ${
          network.decimals[0] || null
        }`
      )
      chain.decimals = network.decimals[0] || null
    }

    if (chain.account !== network.standardAccount) {
      console.log(
        `Updating chain account for ${id} from ${chain.account} to ${network.standardAccount}`
      )
      chain.account = network.standardAccount
    }
  }

  //
  // sort + save updated chaindata
  //

  chaindata.sort((a, b) => {
    if (a.id === 'polkadot') return -1
    if (b.id === 'polkadot') return 1

    if (a.relay?.id === 'polkadot' && b.relay?.id !== 'polkadot') return -1
    if (b.relay?.id === 'polkadot' && a.relay?.id !== 'polkadot') return 1

    if (a.relay?.id === 'polkadot' && b.relay?.id === 'polkadot')
      return a.relay?.paraId - b.relay?.paraId

    if (a.id === 'kusama') return -1
    if (b.id === 'kusama') return 1

    if (a.relay?.id === 'kusama' && b.relay?.id !== 'kusama') return -1
    if (b.relay?.id === 'kusama' && a.relay?.id !== 'kusama') return 1

    if (a.relay?.id === 'kusama' && b.relay?.id === 'kusama')
      return a.relay?.paraId - b.relay?.paraId

    return 0
  })
  fs.writeFileSync('./chaindata.json', JSON.stringify(chaindata, null, 2))

  for (const chain of chaindata) {
    if (chaindata.filter((innerChain) => chain.id === innerChain.id).length > 1)
      console.warn(`chain id ${chain.id} is duplicated!`)
  }

  //
  // copy assets
  //

  for (const chain of chaindata) {
    if (chain.relay === undefined) continue
    const id = chain.id
    const relayPrefix = chain.relay.id === 'polkadot' ? 0 : 2
    const paraId = chain.relay.paraId

    try {
      await exec(`mkdir -p "assets/${chain.id}"`)
      await exec(
        `rsync -avhP "../chaindata/${relayPrefix}/parathreads/${paraId}/assets/" "assets/${chain.id}"`
      )
    } catch (error) {
      console.error('error copying assets', error)
      continue
    }
  }
})()
