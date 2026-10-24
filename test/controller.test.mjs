import assert from 'node:assert/strict'
import test from 'node:test'
import { Dictation } from '../src/controller.mjs'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture({ record = async () => recording(), transcribe = async () => 'spoken words', maxDurationMs = 0 } = {}) {
  const events = []
  const errors = []
  const inserted = []
  const backend = { record, transcribe, dispose() { this.disposed = (this.disposed ?? 0) + 1 } }
  const controller = new Dictation(backend, event => events.push(event), error => errors.push(error), {
    maxDurationMs,
    insert: (_target, text) => { inserted.push(text); return Boolean(text.trim()) },
  })
  const target = { editor: { isDestroyed: false } }
  return { controller, backend, target, events, errors, inserted }
}

function recording(overrides = {}) {
  return {
    stopCalls: 0,
    cleanupCalls: 0,
    async stop() { this.stopCalls++; return { path: 'audio.wav' } },
    async cleanup() { this.cleanupCalls++ },
    ...overrides,
  }
}

test('cancelling startup ignores late readiness and cleans the late recorder', async () => {
  const ready = deferred()
  const rec = recording()
  const f = fixture({ record: () => ready.promise })
  const starting = f.controller.start(f.target)
  assert.equal(f.controller.state, 'starting')
  assert.equal(f.controller.cancel(), true)
  ready.resolve(rec)
  assert.equal(await starting, false)
  assert.equal(f.controller.state, 'idle')
  assert.equal(rec.cleanupCalls, 1)
  assert.deepEqual(f.inserted, [])
})

test('double stop shares one stop and transcription request', async () => {
  const rec = recording()
  let transcriptions = 0
  const f = fixture({ record: async () => rec, transcribe: async () => { transcriptions++; return 'spoken words' } })
  let guardChecks = 0
  f.target.isCurrent = () => { guardChecks++; return true }
  assert.equal(await f.controller.start(f.target), true)
  const first = f.controller.stop()
  const second = f.controller.stop()
  assert.equal(first, second)
  assert.equal(await first, true)
  assert.equal(rec.stopCalls, 1)
  assert.equal(rec.cleanupCalls, 1)
  assert.equal(transcriptions, 1)
  assert.deepEqual(f.inserted, ['spoken words'])
  assert.equal(f.controller.state, 'idle')
  const completedChecks = guardChecks
  await new Promise(resolve => setTimeout(resolve, 70))
  assert.equal(guardChecks, completedChecks)
})

test('cancel during recognition ignores a late transcript', async () => {
  const result = deferred()
  const rec = recording()
  const f = fixture({ record: async () => rec, transcribe: () => result.promise })
  await f.controller.start(f.target)
  const stopping = f.controller.stop()
  assert.equal(f.controller.state, 'transcribing')
  f.controller.cancel()
  result.resolve('too late')
  assert.equal(await stopping, false)
  assert.deepEqual(f.inserted, [])
  assert.equal(rec.cleanupCalls, 1)
})

test('spontaneous helper failure invalidates the active recording', async () => {
  const rec = recording()
  let onEvent
  const f = fixture({ record: async (_signal, callback) => { onEvent = callback; return rec } })
  await f.controller.start(f.target)
  onEvent({ type: 'error', message: 'input device disconnected' })
  assert.equal(f.controller.state, 'idle')
  assert.match(f.errors[0].message, /disconnected/u)
  assert.equal(rec.cleanupCalls, 1)
  assert.deepEqual(f.inserted, [])
})

test('maximum duration enters transcription once', async () => {
  const rec = recording()
  const f = fixture({ record: async () => rec, maxDurationMs: 15 })
  await f.controller.start(f.target)
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.equal(rec.stopCalls, 1)
  assert.equal(rec.cleanupCalls, 1)
  assert.deepEqual(f.inserted, ['spoken words'])
  assert.equal(f.events.filter(event => event.state === 'transcribing' && event.reason === 'duration-limit').length, 1)
})

test('startup failure returns to idle and reports the cause', async () => {
  const f = fixture({ record: async () => { throw new Error('microphone denied') } })
  assert.equal(await f.controller.start(f.target), false)
  assert.equal(f.controller.state, 'idle')
  assert.match(f.errors[0].message, /microphone denied/u)
})

test('periodic editor guard cancels and cleans up on external target changes', async () => {
  const rec = recording()
  let valid = true
  const f = fixture({ record: async () => rec })
  f.target.isCurrent = () => valid
  await f.controller.start(f.target)
  valid = false
  await new Promise(resolve => setTimeout(resolve, 70))
  assert.equal(f.controller.state, 'idle')
  assert.equal(rec.cleanupCalls, 1)
  assert.deepEqual(f.inserted, [])
})

test('disposing cancels once and disposes the backend idempotently', async () => {
  const rec = recording()
  const f = fixture({ record: async () => rec })
  await f.controller.start(f.target)
  f.controller.dispose()
  f.controller.dispose()
  assert.equal(rec.cleanupCalls, 1)
  assert.equal(f.backend.disposed, 1)
  assert.equal(await f.controller.start(f.target), false)
})
