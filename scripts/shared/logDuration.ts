export const logDuration = (label: string) => {
  const start = process.hrtime()

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins ? `${mins}m ${secs}s` : `${secs}s`
  }

  return () => {
    const stop = process.hrtime(start)
    const elapsed = stop[0] + stop[1] / 1e9

    console.log(`Completed ${label} in ${formatDuration(elapsed)}`)
  }
}
