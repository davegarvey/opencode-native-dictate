# Changelog

Notable changes to OpenCode Native Dictate are recorded here. This project follows semantic versioning; while the major version is zero, minor releases may include breaking changes.

## [0.2.0] - 2026-10-26

### Added

- Allow dictation while OpenCode is responding, inserting the transcript into the prompt without submitting it.
- Show actionable setup instructions when the local recorder or Python runtime is missing.

### Changed

- Clarify in the installation guide that adding the plugin does not install its local recorder and speech runtime.

## [0.1.0] - 2026-10-25

### Added

- Offline macOS voice dictation for OpenCode v2 using Parakeet by default, with Qwen3-ASR as an optional backend.
- Native microphone capture, prompt-cursor insertion, cancellation, device selection and setup diagnostics.
- Explicit setup that asks before installing the local runtime and downloading model files.
- npm package metadata and a prebuilt TUI entrypoint for OpenCode's CLI plugin loader.

### Compatibility

- Targets OpenCode 2.1.4 on Apple Silicon macOS; Ghostty is the primary tested terminal.

### Validation

- Basic live dictation was confirmed in Ghostty after granting microphone permission.
- The full editor, microphone lifecycle, network-disabled transcription and clean npm-install acceptance matrix remains in progress. See the README validation limits and `docs/acceptance-results.md` for the current results.
