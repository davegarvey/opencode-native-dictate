import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { removePrivateSessionDirectory, createPrivateSessionDirectory } from './session-files.mjs';
import { SpeechGate } from './speech-gate.mjs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modelConfig = JSON.parse(readFileSync(join(root, 'config/models.json'), 'utf8')).models;

// Bounded line protocol, with explicit exit/error handling and hard deadlines.
function processLines(command, args, {protocolErrorsFail = false, ...spawnOptions} = {}) {
  const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe'], ...spawnOptions});
  let waiting, dead, tail = '', killPromise;
  const queue = [];
  child.stdin.on('error', () => {});
  child.stderr.on('data', data => { tail = (tail + data).slice(-2000); });
  const lines = createInterface({input: child.stdout});
  const fail = error => {
    if (dead) return;
    dead = error;
    waiting?.reject(error);
    waiting = undefined;
    api.onFailure?.(error);
  };
  lines.on('line', line => {
    if (Buffer.byteLength(line, 'utf8') > 1000000) return fail(new Error('Helper response too large'));
    try {
      const value = JSON.parse(line);
      if (value.type === 'level') { api.onLevel?.(value); return; }
      if (value.type === 'error' && protocolErrorsFail) { fail(new Error(value.message)); return; }
      if (waiting) { const pending = waiting; waiting = undefined; pending.resolve(value); }
      else if (queue.length >= 16) fail(new Error('Worker exceeded the pending response limit'));
      else queue.push(value);
    } catch { fail(new Error('Invalid helper response')); }
  });
  child.on('error', fail);
  child.on('exit', (code) => fail(new Error(`Helper exited (${code}). ${tail}`)));
  const api = {
    child, onLevel: undefined, onFailure: undefined,
    async next(milliseconds = 120000) {
      if (queue.length) return queue.shift();
      if (dead) throw dead;
      let timer;
      try {
        return await new Promise((resolve, reject) => {
          waiting = {resolve, reject};
          timer = setTimeout(() => { waiting = undefined; reject(new Error('Worker timed out')); void api.kill().catch(() => {}); }, milliseconds);
        });
      } finally { clearTimeout(timer); }
    },
    send(value) { child.stdin.write(value + '\n'); },
    kill() {
      if (killPromise) return killPromise;
      killPromise = (async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.stdin.end();
        child.kill('SIGTERM');
        const exited = await waitForExit(child, 1000);
        if (!exited && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          if (!await waitForExit(child, 1000)) throw new Error('Child process did not exit after SIGKILL');
        }
      })();
      return killPromise;
    }
  };
  return api;
}

function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = value => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(child.exitCode !== null || child.signalCode !== null), milliseconds);
    timer.unref?.();
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) finish(true);
  });
}

export class Backend {
  worker; idleTimer;
  constructor(options = {}) {
    this.python = options.python ?? join(root, '.venv/bin/python');
    this.backend = options.backend ?? 'parakeet';
    const configuredModel = modelConfig[this.backend];
    if (!configuredModel) throw new Error(`Unsupported ASR backend: ${this.backend}`);
    this.modelPathOverride = options.modelPath;
    this.modelPath = this.modelPathOverride ?? join(
      process.env.OPENCODE_DICTATE_HOME ?? join(homedir(), 'Library', 'Application Support', 'OpenCode Native Dictate'),
      'models', this.backend, configuredModel.revision,
    );
    this.idleMs = options.idleMs ?? 120000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 120000;
    this.recognitionTimeoutMs = options.recognitionTimeoutMs ?? 300000;
    this.deviceUID = options.deviceUID;
    this.workerBackend = undefined;
    this.requestID = 0;
  }
  async setBackend(backend) {
    const configuredModel = modelConfig[backend];
    if (!configuredModel) throw new Error(`Unsupported ASR backend: ${backend}`);
    if (backend === this.backend) return;
    await this.dispose();
    this.backend = backend;
    this.modelPath = this.modelPathOverride ?? join(
      process.env.OPENCODE_DICTATE_HOME ?? join(homedir(), 'Library', 'Application Support', 'OpenCode Native Dictate'),
      'models', backend, configuredModel.revision,
    );
  }
  async record(signal, onEvent = () => {}) {
    const directory = await createPrivateSessionDirectory();
    const path = join(directory, 'audio.wav');
    const recorderEnv = this.deviceUID
      ? {...process.env, OPENCODE_DICTATE_DEVICE_UID: this.deviceUID}
      : process.env;
    const recorder = processLines(join(root, 'bin/recorder'), [path], {env: recorderEnv, protocolErrorsFail: true});
    let cleaned = false;
    const speechGate = new SpeechGate();
    recorder.onLevel = value => {
      speechGate.observe(value);
      onEvent({ type: 'level', ...value });
    };
    recorder.onFailure = error => onEvent({ type: 'error', message: error.message });
    const cleanup = async () => {
      if (cleaned) return; cleaned = true;
      signal.removeEventListener('abort', cancel);
      await recorder.kill(); await removePrivateSessionDirectory(directory);
    };
    const cancel = () => { void cleanup().catch(() => {}); };
    signal.addEventListener('abort', cancel, {once: true});
    if (signal.aborted) { await cleanup(); throw new Error('Cancelled'); }
    try {
      const ready = await recorder.next(60000);
      if (ready.type !== 'ready') throw new Error('Recorder did not start');
      return {
        async stop() {
          recorder.send('stop');
          const result = await recorder.next(10000);
          if (result.type !== 'stopped') throw new Error('Recording was cancelled');
          return {path, speech: speechGate.speech};
        }, cleanup
      };
    } catch (error) { await cleanup(); throw error; }
  }
  async transcribe({path, speech}, signal) {
    if (!speech) return '';
    clearTimeout(this.idleTimer);
    const cancel = () => { void this.dispose(); };
    signal.addEventListener('abort', cancel, {once: true});
    try {
      if (signal.aborted) throw new Error('Cancelled');
      if (this.worker && this.workerBackend !== this.backend) await this.dispose();
      if (!this.worker) {
        this.worker = processLines(this.python, [join(root, 'scripts/transcribe.py'), this.backend, this.modelPath], {
          env: {...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false'}
        });
        this.workerBackend = this.backend;
        const ready = await this.worker.next(this.startupTimeoutMs);
        if (ready.type !== 'ready' || ready.backend !== this.backend) throw new Error('Speech model worker did not report the selected backend ready');
      }
      const id = ++this.requestID;
      this.worker.send(JSON.stringify({id, path}));
      const result = await this.worker.next(this.recognitionTimeoutMs);
      if (result.id !== id) throw new Error(`Worker response id mismatch (expected ${id})`);
      if (result.type === 'error') throw new Error(result.message || 'Speech recognition failed');
      if (result.type !== 'result' || typeof result.text !== 'string') throw new Error('Invalid transcription response');
      this.idleTimer = setTimeout(() => { void this.dispose().catch(() => {}); }, this.idleMs);
      this.idleTimer.unref();
      return result.text;
    } catch (error) { await this.dispose(); throw error; }
    finally { signal.removeEventListener('abort', cancel); }
  }
  async dispose() {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    const worker = this.worker;
    this.worker = undefined;
    this.workerBackend = undefined;
    if (worker) await worker.kill();
  }
}
