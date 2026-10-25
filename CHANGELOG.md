# Changelog

Notable changes to OpenCode Native Dictate are recorded here. This project follows semantic versioning; while the major version is zero, minor releases may include breaking changes.

## [0.1.0] - Unreleased

### Added

- Offline macOS voice dictation for OpenCode v2 using Parakeet by default, with Qwen3-ASR as an optional backend.
- Native microphone capture, prompt-cursor insertion, cancellation, device selection and setup diagnostics.
- Explicit setup that asks before installing the local runtime and downloading model files.
- npm package metadata and a prebuilt TUI entrypoint for OpenCode's CLI plugin loader.

### Compatibility

- Targets OpenCode 2.1.4 on Apple Silicon macOS; Ghostty is the primary tested terminal.
- Full editor, microphone lifecycle, offline and clean npm-install acceptance remains in progress.
