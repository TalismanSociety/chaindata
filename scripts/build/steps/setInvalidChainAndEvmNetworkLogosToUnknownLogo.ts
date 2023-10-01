import { PromisePool } from '@supercharge/promise-pool'
import { githubChainLogoUrl, githubUnknownChainLogoUrl } from '@talismn/chaindata-provider'

import { DIR_ASSETS_CHAINS, GITHUB_API, GITHUB_ORG, GITHUB_REPO, GITHUB_TOKEN, PROCESS_CONCURRENCY } from '../constants'
import { gql } from '../util'
import { sharedData } from './_sharedData'

export const setInvalidChainAndEvmNetworkLogosToUnknownLogo = async () => {
  const { chains, evmNetworks } = sharedData

  const availableChainLogoFilenames = (
    await (
      await fetch(GITHUB_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        body: JSON.stringify({
          query: gql`
          query ChainAssets {
            repository(owner: "${GITHUB_ORG}", name: "${GITHUB_REPO}") {
              ChainAssets: object(expression: "HEAD:${DIR_ASSETS_CHAINS}") {
                ... on Tree {
                  entries {
                    name
                    path
                  }
                }
              }
            }
          }
        `,
        }),
      })
    ).json()
  )?.data?.repository?.ChainAssets?.entries?.map?.((entry: any) => entry?.name)

  await PromisePool.withConcurrency(PROCESS_CONCURRENCY)
    .for([...chains, ...evmNetworks])
    .process(async (chainOrNetwork) => {
      chainOrNetwork.logo = availableChainLogoFilenames.includes(`${chainOrNetwork.id}.svg`)
        ? // use `githubChainLogoUrl(chain.id)` if logo exists in github
          githubChainLogoUrl(chainOrNetwork.id)
        : // fall back to unknown logo if not
          githubUnknownChainLogoUrl
    })
}
