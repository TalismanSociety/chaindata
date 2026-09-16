export const checkDuplicateGenesisHashes = (networks: { id: string; genesisHash?: string }[]): void => {
  const networkIdsByGenesisHash = new Map<string, string[]>()

  for (const { id, genesisHash } of networks) {
    if (!genesisHash) continue
    networkIdsByGenesisHash.set(genesisHash, [...(networkIdsByGenesisHash.get(genesisHash) ?? []), id])
  }

  const duplicates = [...networkIdsByGenesisHash].filter(([, ids]) => ids.length > 1)
  if (!duplicates.length) return

  // networks sharing a genesis hash are the same chain: at least one of them has rpcs pointing at the wrong network,
  // which silently publishes one network's identity (and its funds) under another's id
  const details = duplicates.map(([genesisHash, ids]) => `  ${genesisHash} <- ${ids.join(', ')}`).join('\n')
  throw new Error(`Multiple networks resolve to the same chain:\n${details}`)
}
