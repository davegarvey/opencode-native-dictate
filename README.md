# OpenCode Native Dictate

Native Dictate records speech through macOS and transcribes it locally with MLX Audio. It inserts the plain transcript at the current OpenCode prompt cursor. It does not submit the prompt or send audio to a service.

## Requirements

- OpenCode 2.1.4 on Apple Silicon macOS, initially tested with Ghostty
- Node.js and npm for installation; `uv` for the isolated Python 3.12 runtime
- About 110 MiB of runtime wheels and 2.51 GB for the default Parakeet model; allow at least 3.5 GB free for setup
- Microphone permission for the app running OpenCode

Qwen3-ASR is an optional alternative. Its pinned 0.6B 8-bit model is about 1.01 GB; allow at least 1.8 GB free when selecting it.

## Install

From this repository:

```sh
npm run setup
npm run configure:add
npm run doctor
```

Setup prints the download and disk estimates, asks before downloading, then builds the recorder, installs the pinned runtime and downloads only Parakeet. To choose Qwen instead:

```sh
npm run setup -- --backend qwen3-asr
npm run configure:add -- --backend qwen3-asr
```

`configure:add` registers this repository in `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`). It preserves JSONC comments and unrelated settings. If the path is already registered as a string, the command changes it to OpenCode's package-and-options form. No global config is edited until you run this command.

Dictation has a default chord: **Ctrl+X**, then **D**. OpenCode calls Ctrl+X the leader key; the plugin uses `<leader>d`, so it follows OpenCode if you customize that key. To choose another shortcut, run `npm run configure:add -- --binding ctrl+shift+d` (or `--binding '<leader>v'`). To select a microphone, pass its stable UID from `npm run doctor` output:

```sh
npm run configure:add -- --device-uid 'YOUR_CORE_AUDIO_DEVICE_UID'
```

## Use

In OpenCode, focus the normal prompt and press **Ctrl+X**, then **D** to start dictation. It is designed to work with an existing draft and insert at the cursor. You can also open the command palette with **Ctrl+P** and choose **Start local dictation**. `/dictate-start` is available when slash completion is active at the beginning of the prompt.

Speak, then press **Enter** to stop and transcribe. Press **Escape** to cancel and discard the recording. When transcription finishes, the text is left in the prompt for review; it is never submitted automatically. Dictation uses OpenCode's normal editor undo history.

The footer stays quiet while idle so OpenCode's path and branch details remain visible. During dictation it shows a compact recording indicator with elapsed time and audio level, then a short transcription indicator. Errors appear as brief notifications. Starting is refused outside the normal editable prompt and when text is selected. Typing and paste are consumed while a session is active. Focus, route, cursor or draft changes cancel the session so a late result cannot land in a different prompt.

## Backends and privacy

Parakeet is the default. Qwen3-ASR can be selected explicitly during setup. Both use the same pinned local MLX Audio runtime and run with model downloads disabled. Missing model assets are errors; the plugin does not download at runtime, switch engines or rewrite the transcript with an LLM.

See [docs/transcription.md](docs/transcription.md) for model revisions and limits, [docs/microphone.md](docs/microphone.md) for permission and device behavior, and [docs/manual-testing.md](docs/manual-testing.md) for the Ghostty acceptance steps.

## License

The project code is licensed under the MIT License. Downloaded speech models have separate licenses; see [docs/model-licenses.md](docs/model-licenses.md).

## Check, update and remove

`npm run doctor` checks the host, recorder, input-device list, Python runtime, selected model assets and global registration. It does not record audio or download files. Re-run `npm run setup` after updating this repository; setup reuses matching pinned assets.

Remove the registration with:

```sh
npm run configure:remove
```

This leaves model files in Application Support so they can be reused. Delete `~/Library/Application Support/OpenCode Native Dictate` separately only if you want to reclaim that disk space. Restart OpenCode after changing plugin registration.

## Current validation limits

The automated Swift, Python and Node suites pass. Real USB selection/disconnect, microphone permission attribution in Ghostty, model loading against downloaded assets, offline transcription accuracy and the full editor acceptance matrix still require checks on the target Mac. See [docs/architecture.md](docs/architecture.md) for the evidence collected so far and [docs/manual-testing.md](docs/manual-testing.md) for the remaining checks.
