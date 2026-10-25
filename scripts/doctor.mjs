import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'jsonc-parser'

const backendIndex = process.argv.indexOf('--backend')
const requestedBackend = backendIndex >= 0 ? process.argv[backendIndex + 1] : undefined
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelConfig = JSON.parse(await readFile(join(root, 'config/models.json'), 'utf8'))
const packageInfo = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const packageName = packageInfo.name
const installCommand = `opencode plugin add ${packageName}@${packageInfo.version}`
const setupCommand = process.env.npm_lifecycle_event === 'doctor'
  ? 'npm run setup'
  : `npx --yes --package ${packageName}@${packageInfo.version} native-dictate setup`
const cliConfigPath = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, 'opencode', 'cli.json')
  : join(homedir(), '.config', 'opencode', 'cli.json')
const cliText = await readFile(cliConfigPath, 'utf8').catch(() => undefined)
const cliParseErrors = []
const cliConfig = cliText ? parse(cliText, cliParseErrors) : undefined
const pluginEntry = Array.isArray(cliConfig?.plugins)
  ? cliConfig.plugins.find(entry => {
    const configuredPackage = typeof entry === 'string' ? entry : entry?.package
    return configuredPackage === root || configuredPackage === packageName || configuredPackage?.startsWith(`${packageName}@`)
  })
  : undefined
const pluginOptions = pluginEntry && typeof pluginEntry === 'object' && pluginEntry.options && typeof pluginEntry.options === 'object'
  ? pluginEntry.options
  : {}
const backend = requestedBackend ?? process.env.OPENCODE_DICTATE_BACKEND ?? pluginOptions.backend ?? 'parakeet'
const model = modelConfig.models[backend]
const dataRoot = process.env.OPENCODE_DICTATE_HOME ?? join(homedir(), 'Library', 'Application Support', 'OpenCode Native Dictate')
let failures = 0

function report(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'CHECK'} ${label}: ${detail}`)
  if (!ok) failures++
}

function command(name, args, extraEnv = {}) {
  return spawnSync(name, args, {encoding: 'utf8', timeout: 5000, env: {...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', ...extraEnv}})
}

report('platform', process.platform === 'darwin' && process.arch === 'arm64', `${process.platform}/${process.arch}; Apple Silicon macOS is required`)
report('backend', Boolean(model), model ? `${backend} (${model.repo})` : `unknown backend '${backend}', choose parakeet or qwen3-asr`)

const isolatedHostData = await mkdtemp(join(tmpdir(), 'native-dictate-doctor-'))
const host = command('opencode', ['--version'], {XDG_DATA_HOME: isolatedHostData, OPENCODE_DB: ':memory:'})
await rm(isolatedHostData, {recursive: true, force: true})
const hostVersion = host.status === 0 ? host.stdout.trim().split(/\s+/u).at(-1)?.replace(/^v/u, '') : undefined
report('OpenCode host', Boolean(hostVersion), hostVersion ?? (host.error?.code === 'ENOENT'
  ? 'opencode is not on PATH'
  : `could not read version${host.error ? `: ${host.error.message}` : ''}${host.status !== null ? ` (exit ${host.status})` : ''}`))
if (hostVersion) report('host compatibility', hostVersion === '2.1.4', `development target is 2.1.4; found ${hostVersion}`)

const recorder = join(dataRoot, 'bin', 'recorder')
const recorderExists = await access(recorder, constants.X_OK).then(() => true, () => false)
report('native helper', recorderExists, recorderExists ? recorder : `run ${setupCommand}`)
if (recorderExists) {
  const devices = command(recorder, ['--list-devices'])
  try {
    const parsed = JSON.parse(devices.stdout)
    const defaults = parsed.devices.filter(device => device.default).map(device => device.name)
    const configuredUID = pluginOptions.deviceUID
    const configuredDeviceFound = !configuredUID || parsed.devices.some(device => device.uid === configuredUID)
    report('input devices', devices.status === 0 && parsed.type === 'devices' && parsed.devices.length > 0 && configuredDeviceFound,
      !configuredDeviceFound
        ? `configured device '${configuredUID}' is missing; choose an available UID below`
        : parsed.devices.length
      ? `${parsed.devices.map(device => `${device.name} [${device.uid}]`).join(', ')}${defaults.length ? `; default: ${defaults.join(', ')}` : ''}`
      : 'no audio input is visible to this process')
  } catch {
    report('input devices', false, devices.stderr.trim() || 'device-list diagnostic returned invalid output')
  }
}

const python = pluginOptions.python ?? join(dataRoot, 'python-env', 'bin', 'python')
const pythonExists = await access(python, constants.X_OK).then(() => true, () => false)
report('isolated Python runtime', pythonExists, pythonExists ? python : `run ${setupCommand}`)
if (pythonExists) {
  const version = command(python, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'])
  report('Python version', version.status === 0 && version.stdout.trim() === modelConfig.runtime.python, version.stdout.trim() || version.stderr.trim())
  const mlx = command(python, ['-c', 'from mlx_audio.version import __version__; print(__version__)'])
  report('MLX Audio runtime', mlx.status === 0 && mlx.stdout.trim() === modelConfig.runtime.mlxAudio,
    mlx.status === 0 ? mlx.stdout.trim() : `runtime unavailable; run ${setupCommand}`)
}

if (model) {
  const modelPath = join(dataRoot, 'models', backend, model.revision)
  const markerPath = join(modelPath, '.dictate-model.json')
  const manifest = await readFile(markerPath, 'utf8').then(text => JSON.parse(text), () => undefined)
  const hasConfig = await access(join(modelPath, 'config.json')).then(() => true, () => false)
  const names = await readdir(modelPath).catch(() => [])
  const weights = names.some(name => name.endsWith('.safetensors'))
  report('selected model assets', manifest?.repo === model.repo && manifest?.revision === model.revision && hasConfig && weights,
    manifest?.revision === model.revision && hasConfig && weights ? `${model.repo} at pinned revision ${model.revision}` : `missing or incomplete at ${modelPath}; run ${setupCommand}${backend === 'parakeet' ? '' : ` --backend ${backend}`}`)
}

if (cliText) {
  const registered = Boolean(pluginEntry)
  report('global plugin registration', cliParseErrors.length === 0 && registered,
    registered ? cliConfigPath : `not registered in ${cliConfigPath}; run '${installCommand}', or npm run configure:add from a local checkout`)
} else report('global plugin registration', false, `no CLI config at ${cliConfigPath}; run '${installCommand}', or npm run configure:add from a local checkout`)

console.log(failures ? `Doctor found ${failures} item(s) to address. It did not record audio or download files.` : 'Doctor checks passed. No audio was recorded and no files were downloaded.')
process.exitCode = failures ? 1 : 0
