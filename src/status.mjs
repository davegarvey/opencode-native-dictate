export const STATUS_TICK_MS = 100

export function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function footerStatus({ state, elapsedMs = 0, level = 0, width = 80 }) {
  const available = Math.max(1, Math.floor(width))
  let status
  if (state === 'starting') status = 'DICT…'
  else if (state === 'recording') {
    const elapsed = formatElapsed(elapsedMs)
    if (available < 24) status = `REC ${elapsed}`
    else {
      const bars = Math.max(0, Math.min(6, Math.round(Math.max(0, Math.min(1, level)) * 6)))
      const meter = `${'█'.repeat(bars)}${'·'.repeat(6 - bars)}`
      status = `REC ${elapsed} ${meter}`
    }
  } else if (state === 'transcribing') status = 'ASR…'
  else return ''

  const chars = [...status]
  if (chars.length <= available) return status
  if (available === 1) return '…'
  return `${chars.slice(0, available - 1).join('')}…`
}
