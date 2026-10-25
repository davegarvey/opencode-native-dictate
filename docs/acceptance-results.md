# Acceptance results

Use this page to record the real OpenCode/Ghostty results before calling the MVP complete. Do not convert an unrun check into a pass based on a mock or code inspection.

## Environment

| Item | Observed value |
|---|---|
| OpenCode | 2.1.4 |
| macOS | 27.0.1 |
| Architecture | arm64 |
| Target terminal | Ghostty |
| Input device | Built-in Mac microphone, default; confirmed by user-run `npm run doctor` (device UID omitted) |
| ASR backend | Parakeet assets and MLX Audio 0.6.1; user confirmed one real dictation produced an accurate transcript, but no reference corpus or timing was recorded |

## Checks completed

| Check | Result | Evidence |
|---|---|---|
| Plugin loads in an isolated OpenCode 2.1.4 TUI from the local checkout | Pass | With temporary XDG config/data/state/cache directories, Ctrl+P palette search displayed **Start local dictation** in the **Dictation** group; process exited without starting a recording. |
| Basic live dictation in Ghostty on the user's Mac | Pass | User confirmed that dictation worked after accepting macOS's microphone permission prompt for Ghostty. This records the basic live-use smoke test only; it does not cover the full editor, device-failure or lifecycle matrix. |
| Global plugin loads from two project directories | Pass | Started OpenCode 2.1.4 in two empty temporary project directories using the existing global CLI registration and isolated XDG data; the Dictation palette group and start command appeared in both. Both TUI processes exited cleanly. |
| Synthetic insertion into empty prompt | Pass | User screenshot shows the synthetic transcript in the prompt. |
| Synthetic insertion in the middle of text | Pass | User screenshot shows `hello synthetic transcript world` with the cursor after the inserted phrase. |
| Editor API undo | Pass | User screenshot shows the previous `hello world` draft restored after the plugin called the prompt editor's `undo()` method. |
| Keyboard undo | Not passed | User reports Cmd+Z does nothing; a shortcut attempt produced a literal `v`. The plugin adds no custom undo menu command; keyboard undo remains unverified. |
| Automated Swift, Python and Node suites | Pass | `npm test`: 49 Node tests and 9 Python tests passed; the Swift suite passed after a clean `npm ci`. |
| Type check and locked Python dependency set | Pass | `npm run check` and `uv lock --check` using the pinned Python 3.12 interpreter passed. |
| npm package entrypoint | Pass, published v0.1.0 | The registry tarball includes the built TUI module and executable `native-dictate` launcher. An isolated npm consumer fetched the release and ran the documented `npx --package ... native-dictate doctor` command. |
| OpenCode package installation | Pass, published v0.1.0 | `opencode plugin add opencode-native-dictate@0.1.0` in a clean XDG profile fetched the package and wrote `"opencode-native-dictate@0.1.0"` to that profile's `cli.json`. |
| Published-package first-run setup | Partially verified | The published `npx` doctor command ran from a separate temporary consumer and reported the helper/runtime checks without recording or downloading. The pinned runtime, recorder build and model download were verified earlier from a local npm tarball, not repeated from the published package. |
| Packaged first-run setup from the npm tarball in an isolated profile | Pass with runtime limits | `native-dictate setup --yes` installed pinned Python/MLX dependencies, built the Swift recorder helper, and downloaded the pinned Parakeet model. `native-dictate doctor` passed platform, backend, host, helper, runtime, model and plugin-registration checks. No input device was visible to the isolated process. |
| Offline model inference in the isolated profile | Not verified | Model assets were present, but inference could not run because this headless execution environment has no Metal device. Validate inference on a normal Apple Silicon Mac. |
| Runtime, model and microphone diagnostics | Pass in user's terminal | User ran `npm run doctor`: Python 3.12, MLX Audio 0.6.1, pinned Parakeet assets and the default built-in microphone were detected; no files were recorded or downloaded by doctor. |
| First real stop-to-transcribe attempt | Failed, cause fixed in code | User saw `Model type ed2b7e8c… not supported for stt`: MLX Audio inferred the model type from the revision-hash directory name. The worker now passes the explicit architecture (`parakeet` or `qwen3_asr`) to MLX Audio. |
| Real stop-to-transcribe retest | Pass, user reported | After the explicit model type fix, the user confirmed that dictation worked and the recognized text was correct. No transcript reference, latency or corpus score was recorded. |
| Default leader chord | Not yet manually checked | Plugin now binds `<leader>d` by default (Ctrl+X, then D under OpenCode's default leader); live Ghostty confirmation is still needed. |
| Live microphone capture in the isolated profile | Not verified | The isolated process could not see an audio input device. Validate recording and transcription in Ghostty on a normal desktop session. |

## Checks still required on the user's Mac

- Verify recording levels, cancellation, USB disconnect, silence, quiet speech and transcription with networking disabled in Ghostty. The initial microphone permission prompt was accepted for the successful smoke test above; denial/recovery behavior remains untested.
- Complete the editor matrix in [manual-testing.md](manual-testing.md), especially beginning/end insertion, attachments, pasted blocks, normal undo and held Enter.
- Run 20 success/cancel/failure cycles, plugin reload and normal/forced host exit; test two independent OpenCode instances and two project directories.
- Build the reference recordings and run the benchmark matrix before reporting latency or accuracy targets.
