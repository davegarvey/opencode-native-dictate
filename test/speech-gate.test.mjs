import test from 'node:test'
import assert from 'node:assert/strict'
import { SpeechGate } from '../src/speech-gate.mjs'

test('digital silence does not count as speech', () => {
  const gate = new SpeechGate()
  for (let i = 0; i < 100; i++) gate.observe({ db: -120, bufferMs: 20 })
  assert.equal(gate.speech, false)
})

test('quiet speech above a quiet room floor passes after calibration', () => {
  const gate = new SpeechGate()
  for (let i = 0; i < 15; i++) gate.observe({ db: -66, bufferMs: 20 })
  for (let i = 0; i < 10; i++) gate.observe({ db: -55, bufferMs: 20 })
  assert.equal(gate.speech, true)
})

test('speech that starts immediately is not lost during background calibration', () => {
  const gate = new SpeechGate()
  for (let i = 0; i < 8; i++) gate.observe({ db: -45, bufferMs: 20 })
  assert.equal(gate.speech, true)
})

test('brief noise bursts do not count as speech', () => {
  const gate = new SpeechGate()
  for (let i = 0; i < 15; i++) gate.observe({ db: -60, bufferMs: 20 })
  for (let i = 0; i < 3; i++) gate.observe({ db: -30, bufferMs: 20 })
  for (let i = 0; i < 20; i++) gate.observe({ db: -60, bufferMs: 20 })
  assert.equal(gate.speech, false)
})

test('invalid meter events do not create speech', () => {
  const gate = new SpeechGate()
  gate.observe({ db: NaN, bufferMs: 20 })
  gate.observe({ db: -20, bufferMs: Infinity })
  assert.equal(gate.speech, false)
})
