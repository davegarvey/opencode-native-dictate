import assert from 'node:assert/strict'
import test from 'node:test'
import { validateOptions } from '../src/options.mjs'

test('plugin options have safe defaults and accept the two local backends', () => {
  assert.deepEqual(validateOptions().options, {
    backend: 'parakeet', binding: undefined, deviceUID: undefined,
    python: undefined, idleMs: 120_000,
    startupTimeoutMs: 120_000, recognitionTimeoutMs: 300_000,
  })
  assert.equal(validateOptions({backend: 'qwen3-asr'}).options.backend, 'qwen3-asr')
  assert.equal(validateOptions({binding: '<leader>d'}).options.binding, '<leader>d')
})

test('invalid backend, binding, device, paths and timeout values return actionable errors', () => {
  for (const [options, message] of [
    [{backend: 'whisper'}, 'backend'],
    [{binding: 'ctrl++v'}, 'binding'],
    [{binding: 'ctrl+x>v'}, 'binding'],
    [{deviceUID: ''}, 'deviceUID'],
    [{python: 'python3'}, 'absolute path'],
    [{modelPath: '/tmp/unverified-model'}, 'Unknown Native Dictate option'],
    [{idleMs: -1}, 'idleMs'],
    [{startupTimeoutMs: 10}, 'startupTimeoutMs'],
    [{recognitionTimeoutMs: 2_000_000}, 'recognitionTimeoutMs'],
  ]) {
    assert.match(validateOptions(options).error, new RegExp(message, 'u'))
  }
})
