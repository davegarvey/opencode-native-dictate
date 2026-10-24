# Dictation Installation

## Purpose

Make the plugin available across OpenCode projects through reproducible setup, safe configuration and clear compatibility and troubleshooting guidance.

## ADDED Requirements

### Requirement: Install globally without changing OpenCode
The plugin SHALL provide a documented global installation method that works across projects without project-local copies, patching OpenCode or depending on another dictation plugin. Setup MUST preserve unrelated user configuration and support removal without deleting unrelated files or shared model assets.

#### Scenario: Two projects
- **WHEN** a user completes global setup and launches OpenCode in two different project directories
- **THEN** dictation is available in both without additional project setup

#### Scenario: Existing configuration
- **WHEN** installation encounters existing plugins, comments or other settings
- **THEN** those settings remain intact and the plugin is not registered twice

#### Scenario: Remove plugin
- **WHEN** the documented uninstall procedure is followed
- **THEN** this plugin's registration and owned helpers are removed without changing other plugins or shared models

### Requirement: Make dependencies explicit and reproducible
Setup SHALL identify native build tools, speech runtime, model source, approximate download size and disk requirements before downloading. It SHALL isolate and pin runtime dependencies, verify downloaded artifacts where supported and provide recovery from interrupted setup. Runtime activation MUST NOT install dependencies automatically.

#### Scenario: Interrupted model download
- **WHEN** setup is interrupted and rerun
- **THEN** setup resumes or safely retries, validates the complete assets and does not mark a partial model ready

#### Scenario: First activation before setup
- **WHEN** the plugin loads with missing capture or speech dependencies
- **THEN** OpenCode remains usable and the plugin provides the exact setup command needed

### Requirement: Validate configuration
The plugin SHALL document and validate the start shortcut, input device, recognition backend, model identifier or path, runtime path, idle model timeout, recording limit and recognition timeout. Invalid values SHALL disable dictation with a useful diagnostic without breaking ordinary OpenCode usage. Shell execution MUST NOT be used to interpolate configuration values.

#### Scenario: Configure another shortcut
- **WHEN** a valid nonconflicting shortcut is configured and OpenCode restarts
- **THEN** it starts dictation and the UI shows the configured shortcut

#### Scenario: Invalid settings
- **WHEN** a timeout is negative, a path is invalid or a binding cannot be parsed
- **THEN** the plugin names the invalid setting and does not start a helper process

### Requirement: Check host compatibility
The release SHALL declare its tested OpenCode, OpenTUI, macOS and architecture versions. On unsupported hosts or missing required editor capabilities, dictation SHALL fail closed with a compatibility message while ordinary editing remains available. Support for future or older versions MUST NOT be inferred solely from a minimum version comparison.

#### Scenario: Unsupported editor API
- **WHEN** the host lacks required prompt identification or insertion behavior
- **THEN** the plugin disables dictation instead of attempting clipboard or synthetic-key fallback

### Requirement: Document terminal behavior and recovery
Documentation SHALL explain usage, stop-versus-submit behavior, cancellation, offline setup, microphone permissions, device selection, shortcut delivery in Ghostty, model failures and cleanup. It SHALL distinguish tested behavior from unverified manual acceptance items.

#### Scenario: Option key does not arrive as a shortcut
- **WHEN** Ghostty sends a composed character instead of the configured Option shortcut
- **THEN** the troubleshooting guide provides a verified terminal mapping or an alternative binding without requiring application switching during normal dictation

### Requirement: Ship an acceptance procedure
The release SHALL include automated checks for session safety and a reproducible manual test procedure for real microphone and Ghostty behavior. Release notes SHALL record measured cold/warm recognition latency, capture-start latency, accuracy results and any unmet acceptance criteria.

#### Scenario: Release validation
- **WHEN** the implementation is declared MVP complete
- **THEN** evidence covers global installation, shortcut capture, live meter, Enter without submission, Escape cancellation, preserved drafts, repeated sessions, offline recognition and restart cleanup on the primary environment

### Requirement: Install optional models deliberately
Default setup SHALL download only the default recogniser's assets. Installing or selecting the optional LLM-based recogniser SHALL be explicit, and documentation SHALL describe its measured resource and latency trade-offs without promising higher accuracy solely because it uses an LLM.

#### Scenario: Default setup
- **WHEN** setup is run without selecting an optional backend
- **THEN** the LLM-based model is not downloaded or loaded

#### Scenario: Select an uninstalled optional backend
- **WHEN** configuration selects the LLM-based backend before its assets exist
- **THEN** the plugin provides its setup command and leaves the draft untouched
