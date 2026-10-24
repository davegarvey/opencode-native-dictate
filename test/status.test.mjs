import assert from 'node:assert/strict'
import test from 'node:test'
import { footerStatus, formatElapsed, STATUS_TICK_MS } from '../src/status.mjs'

test('footer stays quiet when idle and uses compact indicators while dictation is active', () => {
  assert.equal(footerStatus({ state: 'idle', message: 'Ready. Ctrl+P → Start local dictation' }), '')
  assert.equal(footerStatus({ state: 'completed', message: 'Transcript ready to edit.' }), '')
  assert.equal(footerStatus({ state: 'starting' }), 'DICT…')
  assert.equal(footerStatus({ state: 'transcribing' }), 'ASR…')
  assert.match(footerStatus({ state: 'recording', elapsedMs: 12500 }), /00:12/u)
  assert.notEqual(
    footerStatus({ state: 'recording', level: 0 }),
    footerStatus({ state: 'recording', level: 1 }),
  )
  assert.equal(STATUS_TICK_MS <= 200, true)
})

test('footer compacts recording status for narrow terminals and bounds output width', () => {
  assert.equal(footerStatus({ state: 'recording', elapsedMs: 12500, width: 12 }), 'REC 00:12')
  const compact = footerStatus({ state: 'recording', elapsedMs: 12500, level: 0.5, width: 30 })
  assert.equal([...compact].length <= 30, true)
  assert.match(footerStatus({ state: 'recording', elapsedMs: 12500, level: 0.5 }), /^REC 00:12 /u)
  assert.equal(formatElapsed(60000 * 62 + 999), '62:00')
})
