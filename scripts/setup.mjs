import { spawn } from 'node:child_process';
import { mkdir, readFile, statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeConfig = JSON.parse(await readFile(join(root, 'config/models.json'), 'utf8'));
const models = runtimeConfig.models;
const args = process.argv.slice(2);
const backendIndex = args.indexOf('--backend');
const backend = backendIndex >= 0 ? args[backendIndex + 1] : 'parakeet';
const assumeYes = args.includes('--yes');
const model = models[backend];

if (!model) {
  console.error(`Unknown backend '${backend}'. Choose parakeet or qwen3-asr.`);
  process.exit(2);
}
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error('Native Dictate setup currently requires an Apple Silicon Mac. OpenCode remains unaffected.');
  process.exit(2);
}

const dataRoot = process.env.OPENCODE_DICTATE_HOME ?? join(homedir(), 'Library', 'Application Support', 'OpenCode Native Dictate');
const modelDirectory = join(dataRoot, 'models', backend, model.revision);
const installedManifest = join(modelDirectory, '.dictate-model.json');
const modelAlreadyInstalled = await readFile(installedManifest, 'utf8').then(text => {
  const found = JSON.parse(text);
  return found.repo === model.repo && found.revision === model.revision;
}).catch(() => false);
const runtimeMiB = 110;
const minimumFreeGiB = backend === 'parakeet' ? 3.5 : 1.8;

console.log(`Backend: ${backend}`);
console.log(`Pinned runtime: Python ${runtimeConfig.runtime.python}, MLX Audio ${runtimeConfig.runtime.mlxAudio}`);
console.log(`Model: ${model.repo} (${model.license})`);
console.log(`Model download: ${modelAlreadyInstalled ? 'already installed; will verify and reuse' : model.downloadSize}`);
console.log(`Runtime downloads: up to about ${runtimeMiB} MiB of locked wheels if not already cached`);
console.log(`Free disk space recommended: at least ${minimumFreeGiB.toFixed(1)} GiB`);
console.log('Downloads happen only during this setup command. Dictation runtime stays offline.');

if (!assumeYes) {
  if (!process.stdin.isTTY) {
    console.error('Re-run in an interactive terminal, or pass --yes after reviewing the download sizes.');
    process.exit(2);
  }
  const terminal = createInterface({input: process.stdin, output: process.stdout});
  const answer = await terminal.question('Continue with setup? [y/N] ');
  terminal.close();
  if (!/^y(es)?$/iu.test(answer.trim())) process.exit(1);
}

await mkdir(dataRoot, {recursive: true, mode: 0o700});
const disk = await statfs(dataRoot);
const freeBytes = Number(disk.bavail) * Number(disk.bsize);
if (freeBytes < minimumFreeGiB * 1024 ** 3) {
  console.error(`Setup stopped: only ${(freeBytes / 1024 ** 3).toFixed(1)} GiB is free at ${dataRoot}.`);
  process.exit(1);
}

function run(command, commandArgs, {env = process.env} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {cwd: root, env, stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}`)));
  });
}

try {
  await mkdir(join(dataRoot, 'bin'), {recursive: true, mode: 0o700});
  await mkdir(join(dataRoot, 'swift-module-cache'), {recursive: true, mode: 0o700});
  await run('uv', ['python', 'install', '3.12']);
  await run('uv', ['sync', '--project', root, '--python', '3.12', '--frozen'], {
    env: {...process.env, UV_PROJECT_ENVIRONMENT: join(dataRoot, 'python-env')},
  });
  await run('/usr/bin/swiftc', [
    '-module-cache-path', join(dataRoot, 'swift-module-cache'), '-O',
    join(root, 'native/PermissionGate.swift'),
    join(root, 'native/AudioDevices.swift'),
    join(root, 'native/CaptureHealth.swift'),
    join(root, 'native/AudioFormat.swift'),
    join(root, 'native/Recorder.swift'),
    join(root, 'native/main.swift'),
    '-o', join(dataRoot, 'bin/recorder'),
  ]);
  await run(join(dataRoot, 'python-env', 'bin', 'python'), [join(root, 'scripts', 'download_model.py'), backend, join(dataRoot, 'models')], {
    env: {...process.env, HF_HUB_DISABLE_TELEMETRY: '1'},
  });
  console.log(`Setup complete. Verified model directory: ${modelDirectory}`);
} catch (error) {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Re-run the same setup command to resume locked dependency/model downloads.');
  process.exitCode = 1;
}
