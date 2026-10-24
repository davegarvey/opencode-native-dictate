# Acceptance results

Use this page to record the real OpenCode/Ghostty results before calling the MVP complete. Do not convert an unrun check into a pass based on a mock or code inspection.

## Environment

| Item | Observed value |
|---|---|
| OpenCode | 2.1.4 |
| macOS | 27.0.1 |
| Architecture | arm64 |
| Target terminal | Ghostty |
| Input device | MacBook Pro Microphone (`BuiltInMicrophoneDevice`), default, confirmed by user-run `npm run doctor` |
| ASR backend | Parakeet assets and MLX Audio 0.6.1; user confirmed one real dictation produced an accurate transcript, but no reference corpus or timing was recorded |

## Checks completed

| Check | Result | Evidence |
|---|---|---|
| Plugin loads in an isolated OpenCode 2.1.4 TUI and exits cleanly | Pass | TUI started with temporary XDG config/data/state/cache directories; Ctrl+P palette search displayed **Start local dictation** in the **Dictation** group; process exited without starting a recording. |
| Global plugin loads from two project directories | Pass | Started OpenCode 2.1.4 in two empty temporary project directories using the existing global CLI registration and isolated XDG data; the Dictation palette group and start command appeared in both. Both TUI processes exited cleanly. |
| Synthetic insertion into empty prompt | Pass | User screenshot shows the synthetic transcript in the prompt. |
| Synthetic insertion in the middle of text | Pass | User screenshot shows `hello synthetic transcript world` with the cursor after the inserted phrase. |
| Editor API undo | Pass | User screenshot shows the previous `hello world` draft restored after the plugin called the prompt editor's `undo()` method. |
| Keyboard undo | Not passed | User reports Cmd+Z does nothing; a shortcut attempt produced a literal `v`. The plugin adds no custom undo menu command; keyboard undo remains unverified. |
| Automated Swift, Python and Node suites | Pass | `npm test`: 49 Node tests and 9 Python tests passed; the Swift suite passed after a clean `npm ci`. |
| Type check, native helper build and locked Python dependency set | Pass | `npm run check`, `npm run build:native` and `uv lock --check` using the pinned Python 3.12 interpreter and release cutoff passed. |
| Runtime, model and microphone diagnostics | Pass in user's terminal | User ran `npm run doctor`: Python 3.12, MLX Audio 0.6.1, pinned Parakeet assets and the default MacBook Pro microphone were detected; no files were recorded or downloaded by doctor. |
| First real stop-to-transcribe attempt | Failed, cause fixed in code | User saw `Model type ed2b7e8c… not supported for stt`: MLX Audio inferred the model type from the revision-hash directory name. The worker now passes the explicit architecture (`parakeet` or `qwen3_asr`) to MLX Audio. |
| Real stop-to-transcribe retest | Pass, user reported | After the explicit model type fix, the user confirmed that dictation worked and the recognized text was correct. No transcript reference, latency or corpus score was recorded. |
| Default leader chord | Not yet manually checked | Plugin now binds `<leader>d` by default (Ctrl+X, then D under OpenCode's default leader); live Ghostty confirmation is still needed. |
| Model loader in this execution environment | Architecture resolution passed; inference unavailable | The old unsupported-model-type error is gone. This isolated runner has no Metal device, so only the user's Mac can validate real model inference. |

## Checks still required on the user's Mac

- Verify microphone permission attribution, live levels, cancellation, USB disconnect, silence, quiet speech and offline transcription in Ghostty.
- Complete the editor matrix in [manual-testing.md](manual-testing.md), especially beginning/end insertion, attachments, pasted blocks, normal undo and held Enter.
- Run 20 success/cancel/failure cycles, plugin reload and normal/forced host exit; test two independent OpenCode instances and two project directories.
- Build the reference recordings and run the benchmark matrix before reporting latency or accuracy targets.
