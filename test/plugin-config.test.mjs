import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { editPluginConfig } from '../scripts/plugin-config.mjs'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/plugin-config.mjs', import.meta.url))

const path = '/Users/example/opencode-dictate-plugin'

test('registration preserves JSONC comments, unrelated settings and existing plugin options', () => {
  const source = `{
  "$schema": "https://opencode.ai/v2/cli.json",
  // Keep this user's theme.
  "theme": { "name": "opencode" },
  "plugins": ["another-plugin", {"package":"${path}","options":{"backend":"qwen3-asr"}}]
}\n`
  const once = editPluginConfig(source, 'add', path, {binding: 'ctrl+shift+d'})
  const config = JSON.parse(once.replace(/^\s*\/\/.*\n/gmu, ''))
  assert.match(once, /Keep this user's theme/u)
  assert.deepEqual(config.theme, {name: 'opencode'})
  assert.deepEqual(config.plugins, [
    'another-plugin', {package: path, options: {backend: 'qwen3-asr', binding: 'ctrl+shift+d'}},
  ])
  assert.equal(editPluginConfig(once, 'add', path, {binding: 'ctrl+shift+d'}), once)
})

test('registration upgrades the existing path string and removal is idempotent', () => {
  const source = `{"plugins":["${path}","other"]}`
  const registered = editPluginConfig(source, 'add', path)
  assert.deepEqual(JSON.parse(registered).plugins, [{package: path, options: {}}, 'other'])
  const removed = editPluginConfig(registered, 'remove', path)
  assert.deepEqual(JSON.parse(removed).plugins, ['other'])
  assert.equal(editPluginConfig(removed, 'remove', path), removed)
})

test('malformed JSONC or non-array plugin settings fail without rewriting input', () => {
  assert.throws(() => editPluginConfig('{ bad', 'add', path), /Invalid OpenCode JSONC/u)
  assert.throws(() => editPluginConfig('{"plugins":{}}', 'add', path), /must be an array/u)
})

test('CLI registration is idempotent and removes only its entry in a temporary config', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dictate-cli-config-test-'))
  const configPath = join(directory, 'cli.json')
  try {
    await writeFile(configPath, `{
  "$schema": "https://opencode.ai/v2/cli.json",
  // Preserve this comment.
  "animations": true,
  "plugins": ["unrelated"]
}\n`, {mode: 0o640})
    const cli = (...args) => execFileSync(process.execPath, [script, ...args, '--config', configPath, '--plugin', path], {encoding: 'utf8'})
    cli('add', '--backend', 'qwen3-asr')
    const first = await readFile(configPath, 'utf8')
    const firstMode = (await stat(configPath)).mode & 0o777
    cli('add', '--backend', 'qwen3-asr')
    assert.equal(await readFile(configPath, 'utf8'), first)
    assert.equal((await stat(configPath)).mode & 0o777, firstMode)
    assert.match(first, /Preserve this comment/u)
    const config = JSON.parse(first.replace(/^\s*\/\/.*\n/gmu, ''))
    assert.equal(config.animations, true)
    assert.deepEqual(config.plugins, ['unrelated', {package: path, options: {backend: 'qwen3-asr'}}])
    cli('remove')
    const removed = JSON.parse((await readFile(configPath, 'utf8')).replace(/^\s*\/\/.*\n/gmu, ''))
    assert.deepEqual(removed.plugins, ['unrelated'])
  } finally { await rm(directory, {recursive: true, force: true}) }
})
