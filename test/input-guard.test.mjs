import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { installBusyInputGuard } from '../src/input-guard.mjs'

function key(name, { eventType = 'press', repeated = false } = {}) {
  return {
    name,
    eventType,
    repeated,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true },
    stopPropagation() { this.stopped = true },
  }
}

function host(renderer, onSubmit) {
  renderer.keyInput.on('keypress', (event) => {
    if (event.name === 'return' && !event.prevented && !event.stopped) onSubmit()
  })
}

test('delayed backend consumes Enter while busy, suppresses held repeats, then allows fresh Enter', async () => {
  const renderer = { keyInput: new EventEmitter() }
  let state = 'idle'
  let submissions = 0
  let transcriptions = 0
  host(renderer, () => submissions++)
  const cleanup = installBusyInputGuard(renderer, () => state, {
    enter() {
      if (state === 'starting') return
      if (state === 'recording') {
        state = 'transcribing'
        transcriptions++
        setTimeout(() => { state = 'completed' }, 20)
      }
    },
    escape() { state = 'idle' },
    release() { if (state === 'completed') state = 'idle' },
  })
  const press = (event) => renderer.keyInput.emit('keypress', event)

  state = 'starting'
  press(key('return'))
  assert.equal(submissions, 0)
  state = 'recording'
  press(key('return'))
  assert.equal(transcriptions, 1)
  press(key('return', { eventType: 'repeat', repeated: true }))
  assert.equal(submissions, 0)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(state, 'completed')
  press(key('return', { eventType: 'repeat', repeated: true }))
  assert.equal(submissions, 0)
  renderer.keyInput.emit('keyrelease', key('return', { eventType: 'release' }))
  press(key('return'))
  assert.equal(submissions, 1)
  assert.equal(transcriptions, 1)
  cleanup()
})

test('Escape cancels starting and transcribing sessions without submitting', () => {
  const renderer = { keyInput: new EventEmitter() }
  let state = 'starting'
  let submissions = 0
  let cancellations = 0
  host(renderer, () => submissions++)
  const cleanup = installBusyInputGuard(renderer, () => state, {
    enter() {},
    escape() { cancellations++; state = 'idle' },
  })
  const event = key('escape')
  renderer.keyInput.emit('keypress', event)
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
  assert.equal(cancellations, 1)
  state = 'transcribing'
  const repeat = key('escape', { eventType: 'repeat', repeated: true })
  renderer.keyInput.emit('keypress', repeat)
  assert.equal(repeat.prevented, true)
  assert.equal(repeat.stopped, true)
  assert.equal(cancellations, 1)
  assert.equal(submissions, 0)
  cleanup()
})

test('busy input consumes ordinary typing and paste without replay', () => {
  const renderer = { keyInput: new EventEmitter() }
  let state = 'recording'
  let ordinaryKeys = 0
  let pasted = 0
  renderer.keyInput.on('keypress', event => {
    if (!event.prevented && !event.stopped) ordinaryKeys++
  })
  renderer.keyInput.on('paste', event => {
    if (!event.prevented && !event.stopped) pasted++
  })
  const cleanup = installBusyInputGuard(renderer, () => state, { enter() {}, escape() {} })

  const typing = key('a')
  renderer.keyInput.emit('keypress', typing)
  const paste = {
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true },
    stopPropagation() { this.stopped = true },
  }
  renderer.keyInput.emit('paste', paste)
  assert.equal(typing.prevented, true)
  assert.equal(typing.stopped, true)
  assert.equal(paste.prevented, true)
  assert.equal(paste.stopped, true)
  assert.equal(ordinaryKeys, 0)
  assert.equal(pasted, 0)

  state = 'idle'
  const normal = key('a')
  renderer.keyInput.emit('keypress', normal)
  assert.equal(normal.prevented, false)
  assert.equal(ordinaryKeys, 1)
  cleanup()
})

test('repeated activation and disposal leave one active input guard', () => {
  const renderer = { keyInput: new EventEmitter() }
  const baseline = {
    keypress: renderer.keyInput.listenerCount('keypress'),
    paste: renderer.keyInput.listenerCount('paste'),
    keyrelease: renderer.keyInput.listenerCount('keyrelease'),
  }
  let state = 'recording'
  let cancellations = 0
  const actions = { enter() {}, escape() { cancellations++ } }
  const cleanups = []

  for (let i = 0; i < 3; i++) {
    cleanups.push(installBusyInputGuard(renderer, () => state, actions))
    assert.equal(renderer.keyInput.listenerCount('keypress'), baseline.keypress + 1)
    assert.equal(renderer.keyInput.listenerCount('paste'), baseline.paste + 1)
    assert.equal(renderer.keyInput.listenerCount('keyrelease'), baseline.keyrelease + 1)
    cleanups.at(-1)()
    cleanups.at(-1)()
    assert.deepEqual({
      keypress: renderer.keyInput.listenerCount('keypress'),
      paste: renderer.keyInput.listenerCount('paste'),
      keyrelease: renderer.keyInput.listenerCount('keyrelease'),
    }, baseline)
  }

  cleanups.push(installBusyInputGuard(renderer, () => state, actions))
  renderer.keyInput.emit('keypress', key('escape'))
  assert.equal(cancellations, 1)
  state = 'idle'
  cleanups.at(-1)()
  renderer.keyInput.emit('keypress', key('escape'))
  assert.equal(cancellations, 1)
})
