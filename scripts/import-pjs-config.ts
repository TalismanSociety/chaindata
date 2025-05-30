// import { allNetworks } from '@polkadot/networks'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  prodChains,
  prodParasKusama,
  prodParasKusamaCommon,
  prodParasPolkadot,
  prodParasPolkadotCommon,
  prodRelayKusama,
  prodRelayPolkadot,
} from '@polkadot/apps-config/endpoints/production'
import {
  testChains,
  testParasWestend,
  testParasWestendCommon,
  testRelayWestend,
} from '@polkadot/apps-config/endpoints/testing'
import kebabCase from 'lodash/kebabCase'
import startCase from 'lodash/startCase'
import prettier from 'prettier'

import { PRETTIER_CONFIG } from './shared/constants'

// prioritise rpcs that have good performance and rate limits
// remove pjs rpcs that have had frequent issues reported by users
//
// make sure these are a list of regexes, i.e. Regex[]
const priorityRpcProviders = [
  // test if rpc begins with `wss://rpc.ibp.network` or `wss://sys.ibp.network` or `wss://rpc.dotters.network` or `wss://sys.dotters.network`
  /^wss:\/\/(?:rpc|sys)\.(?:ibp|dotters)\.network/i,

  // test if rpc starts with `wss://1rpc.io/`
  /^wss:\/\/1rpc\.io\//i,

  // test if rpc ends with `dwellier.com` or `dwellier.com/`
  /dwellir\.com\/?$/i,
]

const skippedRpcProviders = [
  // test if rpc ends with `public.blastapi.io` or `public.blastapi.io/`
  /public\.blastapi\.io\/?$/i,

  // test if rpc is `rpc.polkadot.io` or `kusama-rpc.polkadot.io`
  /^wss:\/\/(?:kusama-)?(?:apps-)?rpc\.polkadot\.io\/?$/i,
]

const sortPriorityFirst = (a: string, b: string) => {
  const aIsPriorityIndex = priorityRpcProviders.findIndex((regex) => regex.test(a))
  const bIsPriorityIndex = priorityRpcProviders.findIndex((regex) => regex.test(b))

  if (aIsPriorityIndex !== -1 && bIsPriorityIndex === -1) return -1
  if (bIsPriorityIndex !== -1 && aIsPriorityIndex === -1) return 1
  return aIsPriorityIndex - bIsPriorityIndex
}

const filterSkipped = (url: string) => !skippedRpcProviders.some((regex) => regex.test(url))

// a map of pjs ids to their talisman chaindata equivalents
const customChainIds: Record<string, string | undefined> = {
  aleph: 'aleph-zero',
  composable: 'composable-finance',
  dorafactory: 'dora-factory',
  kilt: 'kilt-spiritnet',
  pioneer: 'bitcountry-pioneer',
  'sora-substrate': 'sora-standalone',
}
// a map of testnet pjs ids to their talisman chaindata equivalents
const customTestnetChainIds: Record<string, string | undefined> = {
  acala: 'mandala-testnet',
  'aleph-testnet': 'aleph-zero-testnet',
  'goldberg-testnet': 'avail-goldberg-testnet',
  'myriad-tesnet': 'myriad-testnet',
}

// a set of pjs ids which we don't want to import
const ignoreChainIds: string[] = []

// a set of testnet pjs ids which we don't want to import
const ignoreTestnetChainIds: string[] = []

// a map of talisman ids to a list of rpcs which we want to prepend to the pjs list
const additionalChainRpcs: Record<string, string[] | undefined> = {
  polkadot: ['wss://1rpc.io/dot'],
  kusama: ['wss://1rpc.io/ksm'],
  ajuna: ['wss://ajuna.ibp.network', 'wss://ajuna.dotters.network'],
  'bifrost-polkadot': ['wss://bifrost-polkadot.ibp.network', 'wss://bifrost-polkadot.dotters.network'],
  hydradx: ['wss://hydration.ibp.network', 'wss://hydration.dotters.network'],
  'hyperbridge-polkadot': ['wss://nexus.ibp.network', 'wss://nexus.dotters.network'],
  'kilt-spiritnet': ['wss://kilt.ibp.network', 'wss://kilt.dotters.network'],
  krest: ['wss://krest.api.onfinality.io/public-ws'],
  moonbeam: ['wss://moonbeam.ibp.network', 'wss://moonbeam.dotters.network'],
  polimec: ['wss://polimec.ibp.network', 'wss://polimec.dotters.network'],
  'polkadot-asset-hub': ['wss://sys.ibp.network/statemint', 'wss://sys.dotters.network/statemint'],
  unique: ['wss://unique.ibp.network', 'wss://unique.dotters.network'],
}

// a map of talisman ids to a list of rpcs with which we want to override the pjs list
const customChainRpcs: Record<string, string[] | undefined> = {
  ewx: ['wss://public-rpc.mainnet.energywebx.com'],
  'genshiro-kusama-2': [],
  khala: [
    'wss://khala-rpc.dwellir.com',
    'wss://khala.public.curie.radiumblock.co/ws',
    'wss://khala-api.phala.network/ws',
  ],
  krest: ['wss://wss-krest.peaq.network/', 'wss://krest.unitedbloc.com/'],
  moonriver: [
    'wss://moonriver-rpc.dwellir.com',
    'wss://wss.api.moonriver.moonbeam.network',
    'wss://moonriver.public.curie.radiumblock.co/ws',
    'wss://moonriver.unitedbloc.com',
  ],
  phala: ['wss://phala-rpc.dwellir.com', 'wss://phala.public.curie.radiumblock.co/ws', 'wss://api.phala.network/ws'],
  'shiden-kusama': [
    'wss://shiden-rpc.dwellir.com',
    'wss://shiden.public.curie.radiumblock.co/ws',
    'wss://rpc.shiden.astar.network',
  ],
}

// a map of testnet talisman ids to a list of rpcs with which we want to override the pjs list
const customTestnetChainRpcs: Record<string, string[] | undefined> = {
  'avail-goldberg-testnet': ['wss://goldberg.avail.tools/ws', 'wss://rpc-goldberg.avail.tools/ws'],
  'tangle-testnet': ['wss://testnet-rpc-archive.tangle.tools'],
}

// a map of talisman ids to talisman names
const customNames: Record<string, string | undefined> = {
  'polkadot-asset-hub': 'Polkadot Asset Hub',
  'polkadot-bridge-hub': 'Polkadot Bridge Hub',
  'bifrost-polkadot': 'Bifrost Polkadot',
  'subgame-polkadot': 'SubGame Gamma Polkadot',
  'thebifrost-mainnet': 'The Bifrost',
  crab: 'Darwinia Crab',
  kreivo: 'Kreivo',
  hydradx: 'Hydration',

  'kusama-asset-hub': 'Kusama Asset Hub',
  'kusama-bridge-hub': 'Kusama Bridge Hub',
  'bifrost-kusama': 'Bifrost Kusama',
  'subgame-kusama': 'SubGame Gamma Kusama',

  'bifrost-testnet': 'Bifrost Testnet',

  'thebifrost-testnet': 'The Bifrost Testnet',
  'avail-goldberg-testnet': 'Avail Goldberg Testnet',

  'westend-asset-hub-testnet': 'Westend Asset Hub',
  'westend-bridge-hub-testnet': 'Westend Bridge Hub',
}

// derive talisman id from pjs id
const idConflicts: Record<string, number | undefined> = {}
const idConflictNums: Record<string, number | undefined> = {}
const idConflictsTestnets: Record<string, number | undefined> = {}
const idConflictNumsTestnets: Record<string, number | undefined> = {}
const deriveId = (info: string | undefined) => (info && customChainIds[info]) || kebabCase(info).toLowerCase()
const deriveTestnetId = (info: string | undefined) =>
  (info && customTestnetChainIds[info]) || appendTestnet(kebabCase(info).toLowerCase())
const appendTestnet = (id: string) => (id.endsWith('-testnet') ? id : `${id}-testnet`)

// fix up pjs chain names to match talisman
const trimName = (text: string, id: string) =>
  customNames[id] ??
  text
    // general suffixes which look ugly
    .replace(/[ -][0-9]+$/i, '')

    .replace(/[ -]\(?network\)?$/i, '')
    .replace(/[ -]\(?protocol\)?$/i, '')

    .replace(/[ -]\(?mainnet\)?$/i, '')
    .replace(/[ -]\(?stage\)?$/i, '')
    .replace(/[ -]\(?staging\)?$/i, '')
    .replace(/[ -]\(?testnet\)?$/i, '')

    .replace(/[ -]\(?network\)?$/i, '')
    .replace(/[ -]\(?protocol\)?$/i, '')

    .replace(/[ -]\(?parachain\)?$/i, '')
    .replace(/[ -]\(?crowdloan\)?$/i, '')
    .replace(/[ -]\(?para\)?$/i, '')

    .replace(/[ -]\(?kusama\)?$/i, '')
    .replace(/[ -]\(?polkadot\)?$/i, '')
    .replace(/[ -]\(?paseo\)?$/i, '')
    .replace(/[ -]\(?foucoco\)?$/i, '')
    .replace(/[ -]\(?standalone\)?$/i, '')

    .replace(/[ -]\(?mainnet\)?$/i, '')
    .replace(/[ -]\(?stage\)?$/i, '')
    .replace(/[ -]\(?staging\)?$/i, '')
    .replace(/[ -]\(?testnet\)?$/i, '')

    .replace(/ by unique$/i, '')
    .replace(/ by polkafoundry$/i, '')
    .replace(/ metaverse$/i, '')

    // remove trailing bracketed stuffs
    .replace(/ \([A-Za-z0-9 ]+\)$/i, '')

    // remove leading/trailing non-alphabeticals
    .replace(/ [^A-Za-z]+$/i, '')
    .replace(/^[^A-Za-z]+ /i, '')

    // turn single-word ALLCAPS names into Startcase names
    .replace(/^[A-Z]+$/, (name) => startCase(name.toLowerCase()))

    // turn single-word alllowercase names into Startcase names
    .replace(/^[a-z]+$/, (name) => startCase(name.toLowerCase()))

    // specific name overrides
    .replace(/^Gm$/, 'GM')
    .replace(/^Kintsugi BTC$/, 'Kintsugi')
    .replace(/^Mangata$/, 'MangataX')
    .replace(/^Crab2$/, 'Darwinia Crab')
    .replace(/^Darwinia2$/, 'Darwinia')

    // trim leading/trailing spaces
    .trim()

const main = async () => {
  // import existing chaindata
  const chaindataMap = Object.fromEntries(
    JSON.parse((await readFile('data/chaindata.json')).toString('utf8')).map((chain: any) => [chain.id, chain]),
  )
  // import existing testnets chaindata
  const testnetsChaindataMap = Object.fromEntries(
    JSON.parse((await readFile('data/testnets-chaindata.json')).toString('utf8')).map((chain: any) => [
      chain.id,
      chain,
    ]),
  )

  // keep track of updated chain ids
  const updatedChainIds: string[] = []

  // keep track of duplicate rpcs
  const seenRpcs: Record<string, boolean | undefined> = {}

  // derive talisman chain from pjs chain and add to chaindata
  const addParaToMap =
    (relay: any, idConflictSuffix: string, isTestnet = false) =>
    (para: any) => {
      const map = isTestnet ? testnetsChaindataMap : chaindataMap

      // ignore pjs chains which we don't want to import
      if (isTestnet ? ignoreTestnetChainIds[para.info] : ignoreChainIds[para.info]) return

      let id = isTestnet ? deriveTestnetId(para.info) : deriveId(para.info)
      const conflicts = isTestnet ? idConflictsTestnets : idConflicts
      const conflictNums = isTestnet ? idConflictNumsTestnets : idConflictNums
      if ((conflicts[id] ?? 0) > 1) {
        id = `${id}-${idConflictSuffix}`
        conflictNums[id] = conflictNums[id] ? (conflictNums[id] ?? 0) + 1 : 1
        if ((conflictNums[id] ?? 0) > 1) id = `${id}-${conflictNums[id]}`
      }

      const chain = map[id] || { id }

      chain.name = trimName(para.text, id)
      if (chain.name !== para.text) console.log(`Prettified chain name ${para.text} -> ${chain.name}`)
      const overrideRpcs = isTestnet ? customTestnetChainRpcs[id] : customChainRpcs[id]
      const prependRpcs = isTestnet ? undefined : additionalChainRpcs[id]
      chain.rpcs = (overrideRpcs ?? ([...(prependRpcs ?? []), ...Object.values(para.providers)] as string[]))
        .filter((url) => url.startsWith('wss://'))
        .sort(sortPriorityFirst)
        .filter(filterSkipped)
        .filter((rpc) => (seenRpcs[rpc] ? false : (seenRpcs[rpc] = true)))
      if (relay) {
        chain.paraId = para.paraId
        chain.relay = relay
      } else {
        delete chain.paraId
        delete chain.relay
      }

      map[chain.id] = chain
      updatedChainIds.push(chain.id)
    }

  ;[
    prodRelayPolkadot,
    prodRelayKusama,
    ...prodParasPolkadot,
    ...prodParasPolkadotCommon,
    ...prodParasKusama,
    ...prodParasKusamaCommon,
    ...prodChains,
  ].forEach(({ info }) => {
    let id = deriveId(info)
    idConflicts[id] = idConflicts[id] ? (idConflicts[id] ?? 0) + 1 : 1
  })
  ;[testRelayWestend, ...testParasWestend, ...testParasWestendCommon, ...testChains].forEach(({ info }) => {
    let id = deriveTestnetId(info)
    idConflictsTestnets[id] = idConflictsTestnets[id] ? (idConflictsTestnets[id] ?? 0) + 1 : 1
  })

  // derive relay chains
  ;[prodRelayPolkadot, prodRelayKusama].forEach(addParaToMap(null, 'relay'))

  // derive polkadot parachains
  ;[...prodParasPolkadot, ...prodParasPolkadotCommon].forEach(addParaToMap({ id: 'polkadot' }, 'polkadot'))

  // derive kusama parachains
  ;[...prodParasKusama, ...prodParasKusamaCommon].forEach(addParaToMap({ id: 'kusama' }, 'kusama'))

  // derive solo chains
  prodChains.forEach(addParaToMap(null, 'standalone'))

  // derive relay (testnets) chains
  ;[testRelayWestend].forEach(addParaToMap(null, 'relay', true))

  // derive westend parachains
  ;[...testParasWestend, ...testParasWestendCommon].forEach(addParaToMap({ id: 'westend-testnet' }, 'westend', true))

  // derive solo (testnets) chains
  testChains.forEach(addParaToMap(null, 'standalone', true))

  // sort chaindata
  const chaindata = Object.values(chaindataMap).sort((a, b) => {
    if (a.id === b.id) return 0
    if (a.id === 'polkadot') return -1
    if (b.id === 'polkadot') return 1
    if (a.id === 'kusama') return -1
    if (b.id === 'kusama') return 1
    return a.id.localeCompare(b.id)
  })

  // sort testnets chaindata
  const testnetsChaindata = Object.values(testnetsChaindataMap).sort((a, b) => {
    if (a.id === b.id) return 0
    if (a.id === 'westend-testnet') return -1
    if (b.id === 'westend-testnet') return 1
    return a.id.localeCompare(b.id)
  })

  // check for testnet <-> mainnet name conflicts and append ` Testnet` to conflicting testnet names
  const chaindataNames = Object.fromEntries(chaindata.map(({ name }) => [name, true]))
  testnetsChaindata.forEach((chain) => {
    if (!chaindataNames[chain.name]) return
    chain.name = `${chain.name} Testnet`
  })

  // check for kusama <-> polkadot <-> solochain name conflicts and append to conflicting kusama/solochain names
  const [soloNames, polkadotNames] = chaindata.reduce(
    ([solo, polka], chain) => {
      if (['polkadot', 'kusama'].includes(chain.id)) return [solo, polka]

      if (!chain.relay) return [[...solo, chain.name], polka]
      if (chain.relay.id === 'polkadot') return [solo, [...polka, chain.name]]

      return [solo, polka]
    },
    [[], []],
  )
  chaindata.forEach((chain) => {
    if (chain.relay?.id === 'kusama')
      if ([...polkadotNames, ...soloNames].includes(chain.name)) {
        // do nothing
        // chain.name = `${chain.name} Kusama`
      }

    if (!chain.relay) if ([...polkadotNames].includes(chain.name)) chain.name = `${chain.name} Standalone`
  })

  // write updated files
  await writeFile(
    'data/chaindata.json',
    await prettier.format(JSON.stringify(chaindata, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
  await writeFile(
    'data/testnets-chaindata.json',
    await prettier.format(JSON.stringify(testnetsChaindata, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )

  console.log('Import complete!')

  // check for missing chain logos
  for (const chain of [...chaindata, ...testnetsChaindata]) {
    try {
      await access(path.join('assets', 'chains', `${chain.id}.svg`))
    } catch {
      console.log(`Missing logo for chain ${chain.id}`)
    }
  }

  // check for paraId conflicts on each relay chain
  const relayChainsByParaId: Record<string, any> = {}
  ;[...chaindata, ...testnetsChaindata].forEach((chain) => {
    if (typeof chain.relay?.id !== 'string') return
    relayChainsByParaId[chain.relay?.id] = relayChainsByParaId[chain.relay?.id] || {}
    relayChainsByParaId[chain.relay?.id][chain.paraId] = relayChainsByParaId[chain.relay?.id][chain.paraId] || []
    relayChainsByParaId[chain.relay?.id][chain.paraId].push(chain.id)
  })

  Object.entries(relayChainsByParaId).forEach(([relayId, chains]) => {
    Object.entries(chains)
      .filter(([, chainIds]: any) => chainIds.length > 1)
      .forEach((conflict: any) => {
        console.log(`Conflicting ${relayId} paraId ${conflict[0]}: ${conflict[1].join(', ')}`)
      })
  })

  // check for id conflicts between testnets and production
  for (const id of Object.keys(chaindataMap)) {
    if (!testnetsChaindataMap[id]) continue
    console.log(`Testnet id ${id} conflicts with production`)
  }

  // print existing chains which aren't listed in pjs repo
  const chainIds = Object.fromEntries([
    ...chaindata.map(({ id }) => [id, true]),
    ...testnetsChaindata.map(({ id }) => [id, true]),
  ])
  updatedChainIds.forEach((id) => delete chainIds[id])
  Object.keys(chainIds).forEach((id) =>
    console.log(`Note: chain ${id} exists in chaindata but not in @polkadot/apps-config`),
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
