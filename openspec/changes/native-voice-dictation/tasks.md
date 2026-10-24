# Tasks

Research and exploratory source files are not proof that these implementation tasks are complete. Read handoff.md first.

## 1. Prove the OpenCode integration boundary

- [x] 1.1 Confirm the installed OpenCode 2.1.4 host contract, including the matching `@opencode/plugin` 2.1.4 and `@opentui/core` / `@opentui/solid` 0.6.8 dependencies; resolve the TUI entrypoint and isolated `cli.json` configuration, record the tested versions, and verify a minimal plugin loads and unloads.
- [ ] 1.2 Implement the prompt-only host adapter and a synthetic transcript command; verify insertion into empty and populated prompts at beginning/middle/end, including Unicode, file references, pasted blocks, normal undo and cursor placement, using the real host editor.
- [x] 1.3 Implement start eligibility and selection refusal; verify dialogs, search, shell mode, disabled prompts and non-prompt textareas cannot start recording.
- [x] 1.4 Prove Enter/Escape interception with a fake delayed backend before integrating microphone capture; verify zero submissions during starting/recording/transcribing, key-repeat safety across completion and normal submission on a fresh Enter.
- [ ] 1.5 Document the integration proof and any low-level API assumptions in docs/architecture.md; verify every required safety check passes before proceeding with end-to-end audio work, or report the precise blocker without a clipboard/host-patching workaround.

## 2. Implement session ownership and native status UI

- [x] 2.1 Implement the session state machine and request-generation cancellation; verify fake-backend tests cover stop/cancel races, double stop, late readiness/results, spontaneous helper failure and maximum-duration stop.
- [x] 2.2 Implement editor/route/revision guards and busy input/paste handling; verify cancellation on focus loss, session switch, editor destruction and external edits without restoring stale drafts.
- [x] 2.3 Implement active-only compact prompt-footer states, timer and meter using host styling; verify idle/completed states stay empty, readiness is truthful, simulated levels refresh at least 5 Hz and narrow layouts remain usable.
- [ ] 2.4 Add idempotent plugin disposal and listener cleanup; verify repeated activation/deactivation/reload leaves one command registration and no lingering interception, and document session behavior beside the tests.

## 3. Implement native microphone capture

- [x] 3.1 Build a Swift capture helper with permission handling and structured readiness/level/terminal events; verify compilation and automated protocol tests for denied permission and cancelled pending authorization, and document first-run permission behavior.
- [ ] 3.2 Implement default and explicitly selected input devices plus a device-list diagnostic; verify a missing device never falls back silently and a USB disconnect terminates the recording with an actionable error.
- [ ] 3.3 Write mono 16 kHz PCM audio with real-time meter values and delivery-health checks; verify format/duration with an audio reader, distinguish silent buffers from lost input and confirm a 15-minute limit emits one transcription-triggering stop event.
- [ ] 3.4 Implement private session directories, orderly file closure, signal/EOF/parent-loss handling and forced termination fallback; verify file permissions, cancellation deletion and process exit using child-process integration tests.
- [ ] 3.5 Run and document a real Ghostty microphone check for startup latency, levels, permission attribution and cancellation; distinguish any unavailable manual checks from passed automated tests.

## 4. Implement the two local recognition adapters

- [ ] 4.1 Pin an isolated MLX Audio runtime and model revisions for Parakeet and Qwen3-ASR; verify each loads from local assets with network disabled and document required audio-decoder dependencies and license notices.
- [x] 4.2 Implement the shared supervised stdio worker with request IDs, bounded output, deadlines, cancellation and explicit errors; verify malformed output, startup failure, inference hang and parent death during inference cannot leave a live worker or insert stale text.
- [x] 4.3 Implement the default Parakeet adapter and optional Qwen3-ASR adapter, including model selection and backend-specific chunking; verify both return transcripts through the same controller contract without invoking rewriting or a second backend.
- [ ] 4.4 Implement conservative silence/short-input handling and long-recording overlap reconciliation; verify empty input, quiet speech, pauses, chunk-edge words and multi-minute fixtures independently for each backend.
- [ ] 4.5 Implement single-model residency, two-minute idle eviction and cancellation-triggered reload; verify consecutive sessions reuse one model, idle resources are released and changing engines never leaves both resident.
- [x] 4.6 Document backend options and limitations in docs/transcription.md; verify examples select each backend, fail clearly when optional assets are absent and do not silently download or fall back.

## 5. Benchmark and select validated model settings

- [ ] 5.1 Assemble the reference corpus described in design.md with reproducible scoring and duration metadata; verify references include technical terms, negations, numbers, silence and long instructions, keeping private human audio out of version control unless explicitly intended.
- [ ] 5.2 Benchmark Parakeet, Qwen3-ASR 0.6B/1.7B and Whisper turbo on identical inputs; deliver docs/benchmarks.md and machine-readable measurements of cold/warm latency, p50/p95, real-time factor, memory, word errors and technical-term errors.
- [ ] 5.3 Evaluate the design's startup, recognition, accuracy and negation targets and choose documented precision/decoding settings; verify all misses are explicit and no claim of faster or better recognition rests on architecture labels or unrelated hardware benchmarks.

## 6. Package, configure and document global installation

- [x] 6.1 Build the distributable TUI entry without duplicating host UI runtimes and reconcile the exploratory dependency tree; verify clean installation, build, typecheck and host loading with supported tool versions, documenting any dependency advisories that remain relevant.
- [x] 6.2 Implement repeatable setup for the native helper, isolated runtime and selected model only; verify interrupted setup recovery and integrity checks, and show download size/disk needs before downloads.
- [x] 6.3 Implement validated configuration and a non-recording doctor command; verify invalid bindings, device IDs, backend/model combinations, paths and timeout values produce actionable errors without breaking OpenCode.
- [x] 6.4 Implement or document global registration/update/uninstall preserving existing JSON/JSONC and unrelated entries; verify idempotent registration in temporary configuration fixtures and successful use from two project directories.
- [x] 6.5 Write README.md and docs/manual-testing.md with exact setup, optional Qwen setup, usage, offline operation, Ghostty mappings, permission recovery and rollback commands; verify the instructions against a clean isolated install.

## 7. Complete end-to-end acceptance

- [ ] 7.1 Run the full automated suite against the supported host and both backends; verify every spec scenario has an automated test or an explicitly identified manual procedure and no fake test is presented as real microphone validation.
- [ ] 7.2 Complete the Ghostty acceptance matrix: type–dictate–edit–dictate–submit, mid-prompt insertion, Escape in every busy state, held Enter, paste, focus/route changes, device/permission failures, silence and offline recognition; record actual results and versions.
- [ ] 7.3 Exercise 20 success/cancel/failure cycles plus plugin reload, normal exit and forced host exit; verify no lingering owned processes, stale active-input handlers, leaked recordings or unbounded memory growth, including simultaneous independent OpenCode instances.
- [ ] 7.4 Verify global operation in two projects and measure the real microphone timing/accuracy targets on the primary Mac; record remaining limitations and declare MVP completion only when the user-visible acceptance criteria pass.

## Workflow follow-up

- Review the completed implementation against this change before syncing and archiving specs.
- Do not archive while required Ghostty/microphone acceptance checks remain unverified.
