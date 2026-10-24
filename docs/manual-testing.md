# Manual acceptance on macOS

These steps exercise the real OpenCode 2.1.4 editor and Ghostty terminal. Synthetic commands and automated tests do not replace microphone or editor checks. Record each result, OpenCode version, macOS version, selected microphone and backend in `docs/acceptance-results.md` before declaring the MVP complete.

## First run

1. Install the default model and register the plugin as described in [README.md](../README.md). Run `npm run doctor` and resolve missing setup items.
2. Open OpenCode in Ghostty and focus the normal prompt. Press **Ctrl+X**, then **D**. Allow the microphone permission prompt. Confirm the chord starts dictation without typing a `d` into the prompt; Ctrl+P → **Start local dictation** remains a fallback.
3. Check that the compact recording indicator appears only after macOS reports capture ready, while the normal path and branch details stay visible. Speak a short phrase and verify the meter moves.
4. Press **Enter** once. Check that the transcript appears at the cursor, the prompt is not submitted, and the normal footer returns without a persistent dictation message. Edit the transcript and submit it yourself.
5. Start another session and press **Escape**. Check that the prompt is unchanged, recording stops, and the normal footer returns without a cancellation message.
6. Check undo through OpenCode's normal editor undo shortcut after a short real dictation. Confirm the transcript is removed and the previous draft is restored. Verify Ghostty sends the configured shortcut; do not assume `Cmd+Z` works inside the terminal.

The slash form `/dictate-start` is available only while slash completion is offered at the beginning of the prompt. The default **Ctrl+X**, then **D** chord works with an existing draft and does not move or replace prompt text.

## Editor and input matrix

| Case | Action | Expected result |
|---|---|---|
| Empty prompt | Start, speak, stop | Transcript appears; nothing is submitted |
| Beginning, middle and end | Place cursor at each position in a populated prompt and dictate | Original text remains in order; cursor follows transcript |
| Unicode and attachments | Include emoji, non-Latin text, file references and pasted blocks around the cursor | Existing content and prompt parts remain intact |
| Undo | After insertion, use OpenCode's configured editor undo shortcut | One transcript edit is removed; prior draft remains |
| Selection | Select text, then request dictation | Actionable refusal; no recording and no edit |
| Other routes | Try command palette/modal, search, shell mode, disabled prompt and another textarea | No recording starts |
| Enter held | Hold Enter across start, recording, stop and transcription | No submission occurs until a fresh Enter after completion |
| Busy editing | Type or paste while starting, recording or transcribing | Input is consumed, never replayed later |
| Focus or session switch | Move focus or change sessions while recording/transcribing | Recording is cancelled; no text is inserted elsewhere |
| Repeated sessions | Type, dictate, edit, dictate again, then submit | Both transcripts and edits are present in the submitted prompt |

## Microphone and offline matrix

| Case | Action | Expected result |
|---|---|---|
| Permission denied | Deny microphone access, then start again | Clear instruction to enable access for Ghostty or the host app and restart it |
| Selected device missing | Configure a stale device UID and start | Error names the missing device; no default-device fallback |
| USB unplugged | Start on a USB mic, unplug during capture | One actionable disconnect error; recording file is removed |
| Silence and quiet voice | Record silence, then quiet speech at a normal distance | Silence yields no transcript; distinguishable quiet speech is retained |
| Offline | After setup, disable networking and transcribe | Local model works without a download or remote request |
| Model absent | Remove/rename the selected model directory in a disposable setup | Clear setup instruction; no auto-download or backend switch |
| Qwen | Install with `--backend qwen3-asr` and repeat short/long cases | Transcript uses Qwen through the same insertion flow |

## Lifecycle matrix

Repeat 20 successful, cancelled and failed sessions. Reload/deactivate the plugin, exit OpenCode normally, force-quit it during capture, and run two OpenCode instances. Confirm that no recorder or Python worker remains, no active-input listener is duplicated, cancelled WAV files are removed, stale owned directories are cleaned on the next session, and model memory returns after the two-minute idle timeout.

The benchmark corpus and latency/accuracy gates are still pending. Do not mark these steps passed until run on the target Mac and documented with actual results.
