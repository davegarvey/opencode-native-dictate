# Proposal

## Why

Speaking long technical instructions should be as convenient as typing them into OpenCode. A local dictation plugin can remove application switching and clipboard handling while keeping the user in control of the final prompt.

## What Changes

- Add a globally installable, independently developed macOS TUI plugin, initially targeting OpenCode 2.1.4 in Ghostty on Apple Silicon.
- Start microphone capture with a configurable shortcut; show recording, elapsed time and a responsive level meter in the existing prompt footer.
- Intercept Enter to stop and transcribe, and Escape to cancel. Never submit a prompt as a side effect of dictation.
- Insert recognised text through the original prompt editor's editing pipeline, preserving existing content, attachments and cursor semantics across repeated sessions.
- Provide selectable offline recognition: a conventional transducer backend by default and an optional LLM-based ASR backend, with explicit setup, bounded model residency, private temporary audio and reliable cleanup.
- Document global installation, configuration, compatibility, troubleshooting and practical acceptance tests.
- Exclude streaming transcripts, speech synthesis, conversational voice mode, automatic submission, LLM rewriting, non-macOS support and multiplexer support from the MVP.

## Capabilities

### New Capabilities

- `dictation-session`: Keyboard interaction, session state, native status UI and safe prompt insertion.
- `local-speech-processing`: Microphone capture, offline recognition, model lifecycle and resource/privacy guarantees.
- `dictation-installation`: Global setup, configuration, version compatibility and diagnostic guidance.

### Modified Capabilities

None. This repository has no existing capability specifications.

## Impact

The implementation will add an OpenCode TUI entrypoint, a session controller, a macOS audio helper, a local transcription adapter, setup tooling and automated/manual tests. Host integration uses the OpenCode 2.x plugin context and OpenTUI editor APIs; it does not fork OpenCode or depend on another dictation plugin. Python/MLX and a downloaded model are the proposed speech dependencies, subject to the explicit feasibility and accuracy gates in the design.

Exploratory files already exist from work before the user requested a specification handoff. They are incomplete and unvalidated, not an accepted implementation. This change is planning-only; all implementation tasks remain unchecked.
