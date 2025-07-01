import { existsSync } from 'node:fs'

import { GITHUB_BRANCH, GITHUB_CDN, GITHUB_ORG, GITHUB_REPO } from './constants'

export const assetUrlPrefixChaindataProvider = `${GITHUB_CDN}/${GITHUB_ORG}/${GITHUB_REPO}/main/`
export const assetUrlPrefix = `${GITHUB_CDN}/${GITHUB_ORG}/${GITHUB_REPO}/${GITHUB_BRANCH}/`
export const assetPathPrefix = './'

// logos are crafted by the balances libs which use main branch to build urls
export const fixAssetUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined
  const assetPath = getAssetPathFromUrl(url)
  const res = getAssetUrlFromPath(assetPathPrefix + assetPath)
  return res
}

export const getAssetUrlFromPath = (path: string | undefined) => {
  if (!path) return path
  if (!path.startsWith(assetPathPrefix)) throw new Error(`Invalid asset path: ${path}`)
  if (!existsSync(path)) return undefined
  return `${assetUrlPrefix}${path.slice(assetPathPrefix.length)}`
}

export const getAssetPathFromUrl = (url: string) => {
  if (url.startsWith(assetPathPrefix)) return url.slice(assetPathPrefix.length)
  if (url.startsWith(assetUrlPrefixChaindataProvider)) return url.slice(assetUrlPrefixChaindataProvider.length)
  if (url.startsWith(assetUrlPrefix)) return url.slice(assetUrlPrefix.length)
  throw new Error(`Invalid asset url: ${url}`)
}
