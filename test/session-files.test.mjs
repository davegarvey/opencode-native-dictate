import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cleanupStaleSessions, createPrivateSessionDirectory, removePrivateSessionDirectory } from '../src/session-files.mjs'

test('session files use private modes and are removed through the owned-directory helper', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dictate-test-root-'))
  try {
    const directory = await createPrivateSessionDirectory(root)
    const directoryMode = (await stat(directory)).mode & 0o777
    const ownerMode = (await stat(join(directory, '.owner.json'))).mode & 0o777
    assert.equal(directoryMode, 0o700)
    assert.equal(ownerMode, 0o600)
    const owner = JSON.parse(await readFile(join(directory, '.owner.json'), 'utf8'))
    assert.equal(owner.pid, process.pid)
    await removePrivateSessionDirectory(directory)
    await assert.rejects(stat(directory), {code: 'ENOENT'})
  } finally { await rm(root, {recursive: true, force: true}) }
})

test('stale cleanup removes only sessions with a dead recorded Native Dictate owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dictate-test-root-'))
  const stale = join(root, 'opencode-dictate-stale')
  const active = join(root, 'opencode-dictate-active')
  const unrelated = join(root, 'opencode-dictate-unrelated')
  const unknown = join(root, 'opencode-dictate-unknown')
  try {
    for (const directory of [stale, active, unrelated, unknown]) await mkdir(directory, {mode: 0o700})
    await writeFile(join(stale, '.owner.json'), JSON.stringify({id: 'opencode-native-dictate', pid: 2_147_483_647}))
    await writeFile(join(active, '.owner.json'), JSON.stringify({id: 'opencode-native-dictate', pid: process.pid}))
    await writeFile(join(unrelated, '.owner.json'), JSON.stringify({id: 'other-app', pid: 2_147_483_647}))
    await writeFile(join(unknown, 'audio.wav'), 'leave unowned directories alone')
    try { process.kill(2_147_483_647, 0) } catch (error) { assert.equal(error.code, 'ESRCH') }

    await cleanupStaleSessions(root)
    await assert.rejects(stat(stale), {code: 'ENOENT'})
    await stat(active)
    await stat(unrelated)
    await stat(unknown)
  } finally { await rm(root, {recursive: true, force: true}) }
})

test('removal refuses arbitrary directories', async () => {
  await assert.rejects(removePrivateSessionDirectory('/private/tmp/ordinary-data'), /not owned by Native Dictate/u)
})

test('removal refuses a prefixed directory without this process owner marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dictate-test-root-'))
  const forged = join(root, 'opencode-dictate-forged')
  try {
    await mkdir(forged, {mode: 0o700})
    await writeFile(join(forged, 'important.txt'), 'not a session')
    await assert.rejects(removePrivateSessionDirectory(forged), /without a valid Native Dictate owner marker/u)
    assert.equal(await readFile(join(forged, 'important.txt'), 'utf8'), 'not a session')
  } finally { await rm(root, {recursive: true, force: true}) }
})
