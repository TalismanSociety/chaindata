export const checkDuplicates = (items: { id: string; name?: string }[]): void => {
  const seen = new Set<string>()
  const duplicates: { id: string; name?: string }[] = []

  for (const item of items)
    if (seen.has(item.id)) {
      duplicates.push(item)
    } else {
      seen.add(item.id)
    }

  if (duplicates.length > 0) {
    console.warn('Duplicate items found:', duplicates)
  }
}
