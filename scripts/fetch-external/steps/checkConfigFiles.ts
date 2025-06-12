import { readFileSync } from 'fs'

import { NetworkBase } from '@talismn/chaindata-provider'
import { parse } from 'yaml'
import z from 'zod/v4'

import { FILE_NETWORKS_ETHEREUM, FILE_NETWORKS_POLKADOT } from '../../shared/constants'
import { DotNetworkConfig, DotNetworkConfigDef, EthNetworkConfig, EthNetworkConfigDef } from '../../shared/types.v4'

export const checkConfigFiles = () => {
  const dotNetworks = parseYaml<DotNetworkConfig[]>(FILE_NETWORKS_POLKADOT)
  checkNetworks(dotNetworks, DotNetworkConfigDef)

  const ethNetworks = parseYaml<EthNetworkConfig[]>(FILE_NETWORKS_ETHEREUM)
  checkNetworks(ethNetworks, EthNetworkConfigDef)
  // //const networks = parse(readFileSync(FILE_NETWORKS_POLKADOT, 'utf-8')) as DotNetworkConfig[]

  // // check each network against zod schema
  // for (const network of dotNetworks) {
  //   const parsable = DotNetworkConfigDef.safeParse(network)
  //   if (!parsable.success) {
  //     console.error(parsable.error.message, { issues: parsable.error.issues, network })
  //     throw new Error(`Failed to parse polkadot network "${network.id}"`)
  //   }
  // }

  // const networks = parse(readFileSync(FILE_NETWORKS_POLKADOT, 'utf-8')) as DotNetworkConfig[]

  // // check each network against zod schema
  // for (const network of networks) {
  //   const parsable = DotNetworkConfigDef.safeParse(network)
  //   if (!parsable.success) {
  //     console.error(parsable.error.message, { issues: parsable.error.issues, network })
  //     throw new Error(`Failed to parse polkadot network "${network.id}"`)
  //   }
  // }
}

const parseYaml = <T>(filePath: string): T => {
  return parse(readFileSync(filePath, 'utf-8')) as T
}

const checkNetworks = (networks: (DotNetworkConfig | EthNetworkConfig)[], networkSchema: z.ZodType<any>) => {
  for (const network of networks) {
    const parsable = networkSchema.safeParse(network)
    if (!parsable.success) {
      console.error(parsable.error.message, { issues: parsable.error.issues, network })
      throw new Error(`Failed to parse network "${network.id}"`)
    }
  }
}
