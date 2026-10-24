import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Backend } from '../src/backend.mjs'

async function fakePython(directory, source) {
  const path = join(directory, `fake-python-${Math.random().toString(16).slice(2)}`)
  await writeFile(path, `#!/usr/bin/env python3\n${source}\n`)
  await chmod(path, 0o700)
  return path
}

async function fixture(source, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dictate-backend-test-'))
  const python = await fakePython(directory, typeof source === 'function' ? source(directory) : source)
  const backend = new Backend({python, modelPath: directory, idleMs: 10_000, ...options})
  return {directory, backend}
}

const resultWorker = `
import json, sys
backend = sys.argv[2]
print(json.dumps({"type":"ready","backend":backend}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    print(json.dumps({"type":"result","id":request["id"],"text":"worker transcript"}), flush=True)
`

test('local worker receives request IDs and returns editable transcript text', async () => {
  const f = await fixture(resultWorker, {modelPath: undefined})
  try {
    assert.equal(await f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal), 'worker transcript')
    await f.backend.dispose()
    assert.equal(f.backend.worker, undefined)
  } finally { await rm(f.directory, {recursive: true, force: true}) }
})

test('Parakeet and Qwen use the same worker contract without keeping two workers resident', async () => {
  const f = await fixture(resultWorker, {modelPath: undefined})
  try {
    const signal = new AbortController().signal
    assert.equal(await f.backend.transcribe({path: '/synthetic.wav', speech: true}, signal), 'worker transcript')
    const parakeetWorker = f.backend.worker
    assert.ok(parakeetWorker)
    assert.equal(await f.backend.transcribe({path: '/synthetic.wav', speech: true}, signal), 'worker transcript')
    assert.equal(f.backend.worker, parakeetWorker)

    await f.backend.setBackend('qwen3-asr')
    assert.equal(f.backend.worker, undefined)
    assert.match(f.backend.modelPath, /qwen3-asr/u)
    assert.equal(await f.backend.transcribe({path: '/synthetic.wav', speech: true}, signal), 'worker transcript')
    assert.notEqual(f.backend.worker, parakeetWorker)
    assert.equal(f.backend.workerBackend, 'qwen3-asr')
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('silent captures skip worker startup and unsupported model choices fail early', async () => {
  const f = await fixture(resultWorker)
  try {
    assert.equal(await f.backend.transcribe({path: '/silent.wav', speech: false}, new AbortController().signal), '')
    assert.equal(f.backend.worker, undefined)
    await assert.rejects(f.backend.setBackend('unknown'), /Unsupported ASR backend/u)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('idle timeout releases the selected model worker', async () => {
  const f = await fixture(resultWorker, {idleMs: 25})
  try {
    await f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal)
    assert.ok(f.backend.worker)
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('worker startup failure is surfaced and its process is reaped', async () => {
  const f = await fixture('import sys\nprint("load failed", file=sys.stderr)\nsys.exit(7)')
  try {
    await assert.rejects(f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal), /Helper exited/u)
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('malformed worker output fails closed and terminates the process', async () => {
  const f = await fixture(`
import json, sys
print(json.dumps({"type":"ready","backend":sys.argv[2]}), flush=True)
sys.stdin.readline()
print("not-json", flush=True)
`)
  try {
    await assert.rejects(f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal), /Invalid helper response/u)
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('recognition timeout kills and reaps a worker that hangs during inference', async () => {
  const f = await fixture(`
import json, sys, time
print(json.dumps({"type":"ready","backend":sys.argv[2]}), flush=True)
sys.stdin.readline()
time.sleep(30)
`, {recognitionTimeoutMs: 40})
  try {
    await assert.rejects(f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal), /timed out/u)
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('cancellation terminates an in-flight local worker without accepting a late result', async () => {
  const f = await fixture(`
import json, sys, time
print(json.dumps({"type":"ready","backend":sys.argv[2]}), flush=True)
sys.stdin.readline()
time.sleep(30)
`)
  const abort = new AbortController()
  try {
    const pending = f.backend.transcribe({path: '/synthetic.wav', speech: true}, abort.signal)
    await new Promise(resolve => setTimeout(resolve, 30))
    abort.abort()
    await assert.rejects(pending)
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('cancellation reaps the worker process, not only its JavaScript handle', async () => {
  const f = await fixture(directory => `
import json, os, sys, time
open(${JSON.stringify(join(directory, 'worker.pid'))}, 'w').write(str(os.getpid()))
print(json.dumps({"type":"ready","backend":sys.argv[2]}), flush=True)
sys.stdin.readline()
time.sleep(30)
`)
  const pidFile = join(f.directory, 'worker.pid')
  const abort = new AbortController()
  try {
    const pending = f.backend.transcribe({path: '/synthetic.wav', speech: true}, abort.signal)
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await access(pidFile); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    const pid = Number(await readFile(pidFile, 'utf8'))
    assert.ok(pid > 1)
    abort.abort()
    await assert.rejects(pending)
    assert.equal(f.backend.worker, undefined)
    assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'})
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})

test('forced termination fallback reaps a worker that ignores SIGTERM', async () => {
  const f = await fixture(`
import json, signal, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
print(json.dumps({"type":"ready","backend":sys.argv[2]}), flush=True)
sys.stdin.readline()
time.sleep(30)
`, {recognitionTimeoutMs: 25})
  try {
    await assert.rejects(f.backend.transcribe({path: '/synthetic.wav', speech: true}, new AbortController().signal), /timed out/u)
    assert.equal(f.backend.worker, undefined)
  } finally { await f.backend.dispose(); await rm(f.directory, {recursive: true, force: true}) }
})
