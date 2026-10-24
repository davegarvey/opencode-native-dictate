import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import plugin from '../dist/tui.js'

function context(options = {}) {
  const layers = []
  const renderer = { keyInput: new EventEmitter(), width: 100 }
  let routeReads = 0
  return {
    layers,
    renderer,
    get routeReads() { return routeReads },
    value: {
      options,
      renderer,
      theme: { text: { success: 'green', warning: 'yellow' } },
      ui: {
        slot() {},
        router: { current() { routeReads++; return { type: 'home' } } },
      },
      keymap: {
        layer(factory) { layers.push(factory) },
        mode: { current() { return 'base' } },
      },
      data: { session: { status() { return 'idle' } } },
    },
  }
}

const listenerCounts = renderer => ({
  keypress: renderer.keyInput.listenerCount('keypress'),
  paste: renderer.keyInput.listenerCount('paste'),
  keyrelease: renderer.keyInput.listenerCount('keyrelease'),
})

test('TUI setup disposal removes input listeners and makes stale commands inert', () => {
  const host = context()
  const baseline = listenerCounts(host.renderer)

  for (let i = 0; i < 3; i++) {
    const dispose = plugin.setup(host.value)
    assert.deepEqual(listenerCounts(host.renderer), {
      keypress: baseline.keypress + 1,
      paste: baseline.paste + 1,
      keyrelease: baseline.keyrelease + 1,
    })

    const staleCommands = host.layers.flatMap(factory => factory().commands)
    dispose()
    dispose()
    assert.deepEqual(listenerCounts(host.renderer), baseline)

    const readsAfterDispose = host.routeReads
    for (const command of staleCommands) command.run()
    assert.equal(host.routeReads, readsAfterDispose)
  }
})

test('dictation starts on the OpenCode leader chord by default and supports an override', () => {
  for (const [options, expected] of [[{}, '<leader>d'], [{binding: 'ctrl+shift+d'}, 'ctrl+shift+d']]) {
    const host = context(options)
    const dispose = plugin.setup(host.value)
    const start = host.layers.flatMap(factory => factory().commands).find(command => command.id === 'dictation.start')
    assert.equal(start.bind, expected)
    dispose()
  }
})

test('test probes are hidden from the command palette and slash completion', () => {
  const host = context()
  const dispose = plugin.setup(host.value)
  const commands = host.layers.flatMap(factory => factory().commands)
  assert.deepEqual(
    commands.filter(command => command.palette).map(command => command.id).sort(),
    ['dictation.start'],
  )
  for (const id of ['dictation.probe', 'dictation.fake-session']) {
    const command = commands.find(candidate => candidate.id === id)
    assert.ok(command)
    assert.equal(command.slash, undefined)
    assert.equal(command.palette, undefined)
  }
  dispose()
})
