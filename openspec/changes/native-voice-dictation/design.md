# Design

## Context

See proposal.md for motivation and scope. Research was performed on 2026-10-24. The installed binary reports **OpenCode 2.1.4**, running on arm64 macOS; the user identifies the machine as an M5 Pro with 64 GB RAM. Node is 24.21.0, uv is present, and `/usr/bin/swiftc` compiles the exploratory recorder when given a writable module cache. Neither a real microphone session nor transcription has been exercised.

The repository began without application code or existing specs. Exploratory code was written before the user redirected the task to a specification handoff. **It is not an implementation baseline or evidence of completion.** See handoff.md for its exact state. No implementation work is authorized by this planning handoff.

The initial OpenCode source investigation used tag `v2.1.2`, commit `a517687`. After the local upgrade, the relevant host sources were checked at `v2.1.4`, commit `68bc26b7da1990ce10ffecfbc1e09eb13aa5d824`; the plugin context, prompt, loader and keymap files inspected here are unchanged between those tags. The local integration target is 2.1.4, and a partial live integration proof is recorded in `docs/architecture.md`. Development dependencies now match the host: `@opencode/plugin` 2.1.4 and `@opentui/core` / `@opentui/solid` 0.6.8, meeting the host package's `>=0.6.8` peer requirements. Relevant findings verified against the v2.1.4 source:

- The plugin entry is a `Plugin.define({ id, setup(context) })` definition from `@opencode/plugin/tui`, not the older `tui(api, options, meta)` form.
- Public context includes `keymap.layer`, `keymap.mode`, `ui.slot`, `renderer`, `options`, and lifecycle cleanup via the returned setup disposer.
- `prompt.footer.status` is a documented slot with session and prompt-mode input. There is no dedicated public prompt getter/setter in this version's plugin context.
- The host's `tui.prompt.append` handler calls its textarea's `insertText`, then moves to the buffer end. The event is directory-scoped, not an editor-bound transaction; broadcasting it is unsuitable for precise cursor/focus safety.
- OpenTUI exposes `currentFocusedEditor`, `currentFocusedRenderable`, `TextareaRenderable.insertText`, `cursorOffset`, selection APIs and global keyboard/paste events. These support direct integration; the partial 2.1.4 proof is documented in `docs/architecture.md`, while the full editor-context and attachment acceptance matrix remains outstanding.

Primary references: [plugin contract](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/tui/context.ts), [prompt implementation](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/tui/src/component/prompt/index.tsx), [plugin loading](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/plugin/src/host.ts), [keymap](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/tui/src/context/keymap.tsx).

## Goals / Non-Goals

**Goals:** Keep input ownership and recognition independent; bind each asynchronous operation to its originating editor; support conventional and LLM-based local ASR behind one small interface; use native capture and explicit installation; make correctness testable without microphone hardware.

**Non-Goals:** A generic plugin framework, a persistent HTTP service, multiple models loaded simultaneously, a fork of OpenCode, broad platform support, or a general-purpose LLM editor. The backend choice changes recognition only; neither backend may rewrite the resulting instruction.

## Decisions

### 1. Prove the prompt boundary before integrating audio

Create a synthetic transcript proof of concept against OpenCode 2.1.4. Identify the actual prompt through the prompt-slot ownership and focused textarea, not merely any focused text editor. Encapsulate this in a small version-specific host adapter. Use the originating textarea's normal insertion method so content-change handlers, undo and prompt-part offsets run through OpenCode's own editing path.

The adapter captures editor identity, route/session identity, revision/text, cursor and selection state. Refuse a nonempty selection to avoid overwriting selected text. Pause typing and paste for the active session; cancel on focus, route or external revision change. Do not restore a stale snapshot over external changes. Revalidate immediately before insertion. Preserve the existing prefix and suffix and add only necessary boundary whitespace; use the editor's offset coordinate system, not assumed JavaScript string offsets. Test Unicode and attachment extmarks explicitly.

Public plugin hooks are preferred. Direct OpenTUI access is a narrower, version-sensitive dependency, not a promise of a stable high-level OpenCode prompt API. If the adapter cannot reliably identify or update the intended editor, fail the feasibility gate and report the exact host limitation. Do not silently substitute clipboard writes, synthetic paste or a patched host.

### 2. Use a single explicit session state machine

States: `idle → starting → recording → transcribing → idle`, with cancellation/error paths from every busy state. Each session gets a generation/request ID and cancellation token. Late readiness, stop and recognition results are ignored after invalidation. Maximum-duration stop, Enter stop and helper termination must converge on one transition, not invoke recognition twice.

Register the start command through the supported keymap. Use a temporary input mode and, where necessary, scoped high-priority keyboard/paste interception to consume active-session inputs before either the global keymap or textarea submits. Escape always cancels; Enter during `starting` and `transcribing` is consumed. Restore input ownership on every exit path and plugin reload. Protect against held Enter crossing the completion boundary using release/repeat information where available and a tested fallback for terminals without release events. Do not resolve this with an arbitrary delay that swallows a legitimate subsequent Enter.

Keep `prompt.footer.status` empty while idle and after a session completes so OpenCode's path, branch and other footer details remain visible. During a session, show only a compact initialization indicator, recording time with a voice meter refreshed at roughly 10 Hz, or a transcription indicator after microphone shutdown. Keep narrow-terminal layouts readable. Send concise actionable failures as brief toasts; do not stream plugin messages through the footer. An empty result is informational, not a fabricated transcript.

**Shortcut:** the default is `<leader>d` (Ctrl+X, then D with OpenCode's default leader); users can override it with a single OpenCode key binding or leader chord. The previous `ctrl+x>v` attempt was not a registered plugin binding: the current global config lists the plugin as a bare path, which supplies no `binding` option, and the plugin previously disabled its shortcut when no option was set. OpenCode's key syntax uses `<leader>d`, not `ctrl+x>v`. The command palette remains a fallback. The new default still needs a live Ghostty check to confirm terminal key delivery and absence of literal prompt text.

### 3. Native Swift capture helper, owned by the plugin

Use AVFoundation/Core Audio in a small CLI helper with newline-delimited JSON events on stdout and control input on stdin. No recording GUI. Emit readiness only after successful start, meter/elapsed events at 10 Hz, and exactly one terminal result. Capture 16 kHz mono PCM WAV or convert safely before recognition.

Prefer AVAudioEngine input capture for device binding, buffer-delivery health checks and level measurement; use Core Audio device IDs for an explicit input override, without changing the system default globally. AVAudioRecorder is a reasonable default-device prototype but does not by itself satisfy device selection or robust disconnection detection. The existing recorder therefore needs redesign or extension, not acceptance as complete.

Handle macOS authorization and verify which executable/terminal owns the permission in Ghostty. Include the required usage-description/signing metadata if needed by the chosen packaging. Permission callbacks must check whether their request was cancelled before starting capture. Device changes are errors for the current recording, not permission to switch microphones silently. Distinguish silent buffers from absent buffers.

The parent owns a mode-0700 session directory and mode-0600 audio. Use stdin EOF plus parent-liveness checking and signal handling; stop on parent loss and remove the session's audio. Bound recording to 15 minutes by default. A limit event stops and transcribes, not just exits the helper. Serialize file closure before recognition or deletion. Escalate stalled termination from graceful shutdown to kill and reap children. A worker processing inference must also detect parent loss while busy, not only when it next reads stdin.

### 4. Offer two local recognition backends, defaulting to conventional ASR

| Candidate | Architecture and evidence | Decision |
|---|---|---|
| Parakeet TDT 0.6B v3 | Speech-specific transducer, not a general-purpose LLM decoder. NVIDIA documents punctuation and 25 European languages. MLX implementations exist. | Default: `parakeet`, initially `mlx-community/parakeet-tdt-0.6b-v3`. Good low-latency candidate; local accuracy and latency remain to be measured. |
| Qwen3-ASR 0.6B / 1.7B | Audio encoder with a Qwen language-model decoder. Supports broader multilingual recognition. Autoregressive token generation can add latency; small size and quantization can mitigate it. | Optional `qwen3-asr`, initially `mlx-community/Qwen3-ASR-0.6B-8bit`. Include 1.7B in evaluation as a configurable quality candidate, not an assumed upgrade. |
| Whisper large-v3-turbo / whisper.cpp | Speech encoder-decoder; autoregressive does not mean it is a general-purpose chat LLM. Mature native implementation with Metal and optional Core ML support. | Benchmark comparator and fallback design option; not a third required shipping adapter. |
| Apple SpeechAnalyzer / SpeechTranscriber | Native OS-managed speech recognition, reducing a separate ML runtime; model availability and OS behavior differ from pinned downloadable engines. | Not selected for initial release: less control over reproducible model/version comparisons. Reconsider after native offline and language validation. |

Sources: [NVIDIA model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), [Qwen architecture](https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/qwen3_asr.md), [Qwen project](https://github.com/QwenLM/Qwen3-ASR), [MLX Audio usage](https://github.com/Blaizzy/mlx-audio/blob/main/docs/getting-started/quickstart-python.md), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Apple SpeechAnalyzer](https://developer.apple.com/documentation/speech/speechanalyzer).

The selection is an engineering judgment, not a benchmark result. Qwen's high-concurrency throughput figures are not single-user M5 Pro latency. Likewise, NVIDIA hardware benchmarks and model-card accuracy do not establish this user's technical-vocabulary accuracy. Do not market the optional backend as categorically more accurate or slower solely because it uses an LLM. Conventional ASR remains the default unless a reviewed spec change revises that behavior.

Use a **single isolated Python/MLX Audio runtime** for both adapters, with pinned versions and model revisions, rather than shipping separate Python stacks or loading both models. The library documents both model families. The existing `parakeet-mlx` prototype predates this decision and must be reconciled. Isolate family-specific loading, chunking and decoding in small adapters; do not assume a shared `generate` signature guarantees identical long-audio or cancellation behavior. Prefer reading the helper's PCM directly where supported. If the pinned runtime needs FFmpeg, install and document a pinned private binary or explicit system dependency; never fail later with an unexplained subprocess error.

Worker contract: `load(selected backend/model)`, `transcribe(audio, language?, abort)`, `unload`. Return plain transcript plus non-content timing metadata. Keep transport request IDs, bounded message sizes, errors and exit supervision outside model-specific code. No HTTP server is needed. Cancellation may terminate the worker if inference is not interruptible; subsequent use reloads it. Keep the selected model resident for two minutes after use, configurable. Optional preload can happen concurrently after recording begins; it must never delay readiness. Do not load at every OpenCode startup by default.

Default setup downloads only Parakeet. Optional Qwen setup is explicit. Use offline-only model loading at runtime; a missing asset is a diagnostic. Never auto-fallback or run both engines to compare a private recording. Do not expose prompt contents as model context. Vocabulary hints can be added later as an explicit capability; no implicit LLM correction pass.

### 5. Treat latency and accuracy as a measured release gate

Create a small reproducible corpus with verbatim references: at least 20 short utterances (3–15 seconds), five 30–90 second instructions, and two 3–5 minute instructions. Include TypeScript, PostgreSQL, Kubernetes, OpenCode, MLX, filenames, acronyms, numbers, negations, pauses and ordinary prose; include silence and low-volume speech. Human recordings on the user's microphone are the decisive acceptance input; synthetic recordings are only preliminary fixtures.

Run Parakeet, Qwen 0.6B, Qwen 1.7B and Whisper turbo on the same corpus with exact versions, precision, hardware and decoding settings recorded. Report cold load, warm stop-to-edit latency, p50/p95, real-time factor, resident/peak memory, word error rate and a separate technical-term error count. Do not combine cold and warm measurements or compare concurrent server throughput against one local utterance. Evaluate quantization's accuracy as well as memory.

Initial performance targets (not measured guarantees): capture readiness p95 under 500 ms after permission is already granted; warm stop-to-edit p95 under 2 seconds for 10-second speech; recognition faster than real time for long speech; no model memory growth across 20 completed/cancelled cycles. Target <=10% normalized word error rate and <=15% technical-term error rate on the clean corpus, with zero lost negations in designated safety sentences. Record misses rather than declaring done. If no model meets a target, explain the measured trade-off and revise the design explicitly; do not conceal it behind a different test corpus.

Chunk according to each backend's tested limits, with overlap reconciliation tested against references. Use conservative speech detection; a fixed RMS threshold alone is insufficient because quiet speech may be discarded. Validate silence hallucination handling separately for each model without arbitrary phrase blacklists that erase legitimate dictation.

### 6. Installation is explicit and reversible

Package a built TUI entrypoint without bundling a second Solid/OpenTUI runtime. Verify local directory entry resolution against OpenCode 2.1.4; `exports["./tui"]` alone must not be assumed sufficient for a path-based install. Use the verified global plugin configuration path (2.x uses `cli.json`; confirm active XDG resolution), preserve comments and existing entries, and document restart/update/uninstall.

Setup builds or installs the native helper, creates an isolated runtime, reports download and disk needs, fetches pinned model artifacts and verifies a smoke transcription. A doctor command checks platform, host compatibility, helper, selected model and Python runtime without recording or downloading by surprise. Invalid options disable dictation only. The initial compatibility target is OpenCode 2.1.4 on arm64 macOS in Ghostty; claim support only after acceptance testing, and expand only with evidence.

## Risks / Trade-offs

- **No dedicated public prompt transaction API** → isolate the adapter, prove insertion/undo/attachments before audio, pin tested compatibility and fail closed on drift.
- **Incorrect keyboard interception can submit a draft** → exercise real host event routing, repeats, paste and terminal encoding; mocked state tests alone are insufficient.
- **LLM-based recognition may add latency or hallucinate** → optional explicit selection, matched benchmarks, silence/negation tests, no rewriting pass.
- **Python/MLX dependency weight** → one isolated pinned runtime, optional model downloads and no idle worker at startup; consider a Swift MLX port only if packaging becomes a measured obstacle.
- **Large model consumes memory used by OpenCode** → one resident model, configurable idle eviction and measured RSS/Metal allocation; no claim of Neural Engine use for MLX.
- **Permission and device behavior differ from the terminal sandbox** → actual Ghostty acceptance remains mandatory; compilation is not capture validation.
- **Unexpected host death leaves audio/processes** → parent-liveness supervision while busy, idempotent teardown and ownership-aware stale-file cleanup.
- **Prototype shortcuts are unsafe** → review or replace them before reuse; see handoff.md.

## Migration Plan

This is an initial release, so there is no data migration. First pass the synthetic host-integration gate, then backend/capture tests, then a local install in an isolated OpenCode configuration, and finally a global install preserving existing settings. Rollback removes the plugin registration and stops owned helpers; deleting large shared model caches is an explicit separate action. Never modify or fork the OpenCode binary.
