import { applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readArguments(args) {
  const result = {action: args[0], config: process.env.XDG_CONFIG_HOME
    ? resolve(process.env.XDG_CONFIG_HOME, 'opencode', 'cli.json')
    : resolve(homedir(), '.config', 'opencode', 'cli.json'), plugin: root, options: {}}
  for (let index = 1; index < args.length; index++) {
    const key = args[index]
    if (key === '--config' || key === '--plugin' || key === '--backend' || key === '--binding' || key === '--device-uid') {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value after ${key}`)
      if (key === '--config') result.config = resolve(value)
      else if (key === '--plugin') result.plugin = resolve(value)
      else if (key === '--backend') result.options.backend = value
      else if (key === '--binding') result.options.binding = value
      else if (key === '--device-uid') result.options.deviceUID = value
    } else throw new Error(`Unknown option: ${key}`)
  }
  if (!['add', 'remove'].includes(result.action)) throw new Error('Usage: node scripts/plugin-config.mjs add|remove [--config PATH] [--plugin PATH] [--backend parakeet|qwen3-asr] [--binding KEY] [--device-uid UID]')
  return result
}

export function editPluginConfig(source, action, pluginPath, options = {}) {
  const errors = []
  const config = parse(source, errors, {allowTrailingComma: true, disallowComments: false})
  if (errors.length) throw new Error(`Invalid OpenCode JSONC: ${printParseErrorCode(errors[0].error)}`)
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('OpenCode CLI configuration must be a JSON object.')
  const plugins = config.plugins ?? []
  if (!Array.isArray(plugins)) throw new Error("OpenCode CLI setting 'plugins' must be an array.")

  const matches = entry => entry === pluginPath || (entry && typeof entry === 'object' && entry.package === pluginPath)
  let nextPlugins
  if (action === 'add') {
    const existing = plugins.find(matches)
    const previousOptions = existing && typeof existing === 'object' && existing.options && typeof existing.options === 'object'
      ? existing.options
      : {}
    const updated = {package: pluginPath, options: {...previousOptions, ...options}}
    if (existing) {
      let inserted = false
      nextPlugins = plugins.flatMap(entry => {
        if (!matches(entry)) return [entry]
        if (inserted) return []
        inserted = true
        return [updated]
      })
    } else nextPlugins = [...plugins, updated]
  } else {
    nextPlugins = plugins.filter(entry => !matches(entry))
  }
  const edits = modify(source, ['plugins'], nextPlugins, {formattingOptions: {insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n'}})
  return applyEdits(source, edits)
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), {recursive: true, mode: 0o700})
  const existingMode = await stat(path).then(value => value.mode & 0o777).catch(() => 0o600)
  const temporary = `${path}.native-dictate-${process.pid}.tmp`
  await writeFile(temporary, content, {mode: existingMode})
  await chmod(temporary, existingMode)
  await rename(temporary, path)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = readArguments(process.argv.slice(2))
    const source = await readFile(args.config, 'utf8').catch(error => error?.code === 'ENOENT'
      ? '{\n  "$schema": "https://opencode.ai/v2/cli.json",\n  "plugins": []\n}\n'
      : Promise.reject(error))
    const updated = editPluginConfig(source, args.action, args.plugin, args.options)
    if (updated !== source) await atomicWrite(args.config, updated)
    console.log(`Native Dictate ${args.action === 'add' ? 'registered in' : 'removed from'} ${args.config}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
