#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const [action, ...args] = process.argv.slice(2)
const targets = {
  setup: ['scripts/setup.mjs'],
  doctor: ['scripts/doctor.mjs'],
  'configure:add': ['scripts/plugin-config.mjs', 'add'],
  'configure:remove': ['scripts/plugin-config.mjs', 'remove'],
}
const target = targets[action]
if (!target) {
  console.error('Usage: native-dictate setup|doctor|configure:add|configure:remove [options]')
  process.exit(2)
}

const child = spawn(process.execPath, [join(root, target[0]), ...target.slice(1), ...args], {
  cwd: root,
  stdio: 'inherit',
})
child.once('error', error => {
  console.error(`Could not start Native Dictate ${action}: ${error.message}`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
