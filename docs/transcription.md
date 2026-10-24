# Local transcription

Native Dictate uses one isolated Python 3.12 environment with `mlx-audio==0.6.1` and the transitive versions recorded in `uv.lock`. The runtime runs on Apple Silicon through MLX. It starts only after a recording stops, reuses one selected ASR model for consecutive dictations and unloads the worker after two idle minutes. Runtime model loading and transcription run with Hugging Face and Transformers offline flags enabled; setup is the only stage that downloads model files.

## Backends

| Backend | Pinned model | License | Model download | Long recordings |
|---|---|---|---:|---|
| `parakeet` (default) | `mlx-community/parakeet-tdt-0.6b-v3` at revision `ed2b7e8c15f9aaa0b5772e2efb986255eaef7e15` | CC-BY-4.0 | about 2.51 GB | Uses 120-second chunks with 15-second overlap. MLX Audio aligns and reconciles token overlap. |
| `qwen3-asr` (optional) | `mlx-community/Qwen3-ASR-0.6B-8bit` at revision `89e96d92ba34aca20b3e29fb10cc284097d1219f` | Apache-2.0 | about 1.01 GB | A 15-minute recording fits in one 1,200-second chunk. MLX Audio's Qwen chunking joins chunk text without token-level overlap reconciliation. |

Both backends return plain recognizer text. There is no LLM rewriting, translation, summary, cloud fallback or automatic model switch. The Qwen model uses a language-model decoder; its smaller parameter count does not establish higher accuracy. No local accuracy or latency benchmark has been completed yet.

See [model-licenses.md](model-licenses.md) for upstream attribution and license links. Model files are fetched from the pinned revisions during setup and are not bundled in this repository.

The helper records WAV PCM, which MLX Audio can read without FFmpeg. Other audio formats are not accepted by the worker. See [microphone.md](microphone.md) for capture and device behavior.

Silence filtering uses a small meter-based gate, not a trained VAD model. It calibrates the first 300 ms, sets a threshold five dB above the lower observed background floor within −62 to −42 dBFS, and requires about 120 ms of sustained energy. It also preserves speech that begins immediately at moderate level instead of assuming the calibration window contains room-only audio. It rejects digital silence and very short noise bursts while retaining quiet speech that rises above the room floor. It cannot reliably distinguish speech from steady noise at the same level; the target-Mac quiet-speech and silence corpus checks remain necessary.

## Setup

The default setup downloads only Parakeet:

```sh
npm run setup
```

Choose the optional Qwen backend explicitly:

```sh
npm run setup -- --backend qwen3-asr
```

Setup prints the model and runtime download estimates, checks free disk space, asks before downloading, builds the helper and creates the locked runtime. It can be rerun to resume downloads. Selecting an uninstalled backend fails with a setup instruction; runtime transcription never downloads or falls back.

Use `OPENCODE_DICTATE_HOME` to set the application support directory. `OPENCODE_DICTATE_DEVICE_UID` selects an input device returned by `bin/recorder --list-devices`; when unset, capture binds to macOS's current default input. A configured but unavailable UID is an error.

## Remaining checks

Model loading against pinned local assets, offline smoke transcription, quiet-speech and silence fixtures, long-audio boundary accuracy, and performance measurements are still pending. Model-card size and license labels are upstream metadata; verify local model files and license notices when preparing a distributable release.
