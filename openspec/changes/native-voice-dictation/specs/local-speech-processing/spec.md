# Local Speech Processing

## Purpose

Capture and recognise spoken instructions locally on Apple Silicon with predictable resource use, private audio handling and recoverable failures.

## ADDED Requirements

### Requirement: Use native microphone capture
The plugin SHALL capture mono microphone audio through macOS facilities and expose readiness, level and terminal success/error signals. It SHALL use the system default input unless a configured device is selected. An unavailable configured device MUST produce an error rather than silently using another device.

#### Scenario: Default microphone
- **WHEN** recording starts without a device override
- **THEN** the current macOS default microphone is used and readiness is reported only after capture starts

#### Scenario: Selected microphone is absent
- **WHEN** recording starts with an unavailable device identifier
- **THEN** capture fails with device-selection guidance and no substitute microphone is activated

### Requirement: Handle microphone authorization
The plugin SHALL request macOS microphone permission when required and explain how to recover from denial or restriction. Cancellation during the permission flow SHALL invalidate the pending session, including a later permission grant.

#### Scenario: Permission denied
- **WHEN** macOS denies access
- **THEN** the plugin returns to idle and identifies the appropriate Privacy & Security setting for the observed requesting application

#### Scenario: Permission arrives after cancellation
- **WHEN** a pending permission request is cancelled in OpenCode and access is later granted
- **THEN** no recording starts for that cancelled session

### Requirement: Recognise locally after setup
After model setup, recognition SHALL work without network access. Audio and transcripts MUST NOT be uploaded, used for remote telemetry or sent to an LLM for rewriting. Missing model assets SHALL cause a setup error rather than a silent download or cloud fallback during dictation.

#### Scenario: Offline dictation
- **WHEN** networking is disabled after setup
- **THEN** capture and recognition still produce editable text

#### Scenario: Model missing offline
- **WHEN** a required model artifact is absent
- **THEN** the plugin names the missing setup step and leaves the prompt unchanged

### Requirement: Preserve spoken meaning
Recognition SHALL return the spoken instruction with recogniser-provided punctuation and capitalization, without summarisation, translation or semantic rewriting. Technical vocabulary and negations SHALL be evaluated against a documented reference corpus before claiming MVP accuracy.

#### Scenario: Technical instruction
- **WHEN** a reference recording contains language names, libraries, identifiers and a negated instruction
- **THEN** the evaluation reports word errors and technical-term errors, and specifically checks that the negation survives

### Requirement: Support bounded long recordings
The plugin SHALL support recordings up to a configurable limit, defaulting to 15 minutes. Long-audio processing SHALL avoid truncating or duplicating chunk boundaries. Reaching the limit SHALL stop capture and begin transcription once, with visible feedback, without submitting.

#### Scenario: Multi-minute instruction
- **WHEN** an instruction spans recognition chunks within the recording limit
- **THEN** its beginning, middle and ending appear in order without duplicated overlap text

#### Scenario: Recording limit reached
- **WHEN** capture reaches its configured maximum duration
- **THEN** capture stops, transcription starts once and the UI explains that the duration limit was reached

### Requirement: Bound resource residency
Capture SHALL not wait for model loading. The recogniser SHALL reuse its loaded model for consecutive sessions and release it after a configurable idle interval, defaulting to two minutes. Loading, recording shutdown and recognition SHALL have finite deadlines and remain cancellable.

#### Scenario: Reuse and release
- **WHEN** two recordings occur within the idle interval and no further recordings follow
- **THEN** the second uses the already loaded recogniser and the worker exits after the idle interval

#### Scenario: Hung recognition
- **WHEN** the recognition deadline expires
- **THEN** the worker is terminated, the UI reports the timeout and the next attempt starts a fresh worker

### Requirement: Remove private session artifacts
Temporary recordings SHALL be accessible only to the current user and removed after completion, cancellation or failure. Plugin disposal and host exit SHALL stop owned helpers. Unexpected parent death SHALL stop capture promptly; any orphaned files SHALL be removed safely at the next startup. Logs MUST NOT contain audio, draft text or transcripts by default.

#### Scenario: Cancel and clean up
- **WHEN** a recording is cancelled
- **THEN** its audio file is deleted and its capture process exits

#### Scenario: Host is killed
- **WHEN** OpenCode exits unexpectedly while recording or recognising
- **THEN** capture stops, owned workers terminate and the next launch cleans only this plugin's stale session files

#### Scenario: Another instance is recording
- **WHEN** a new OpenCode instance cleans stale artifacts
- **THEN** it does not delete files owned by a still-running instance

### Requirement: Detect capture failures
Device removal, capture errors and loss of audio delivery SHALL terminate the session with actionable feedback. An idle audio level alone MUST NOT be treated as a disconnected microphone.

#### Scenario: Disconnect a USB microphone
- **WHEN** the selected device disappears during recording
- **THEN** capture ends with an input-device error, resources are released and no partial result is inserted

#### Scenario: Quiet but connected input
- **WHEN** the connected microphone delivers silent audio buffers
- **THEN** the UI remains responsive and the user can stop or cancel normally

### Requirement: Offer conventional and LLM-based recognition
The plugin SHALL offer selectable local conventional ASR and local LLM-based ASR backends with identical recording, cancellation and prompt-safety behavior. The default SHALL use conventional ASR. Only the selected backend SHALL load; changing backend MUST NOT trigger an automatic second transcription or silently change engines after an error.

#### Scenario: Select the optional LLM recogniser
- **WHEN** the user explicitly installs and selects the LLM-based backend
- **THEN** subsequent dictation uses it locally with the same stop, cancel and review controls, without running the default recogniser as well

#### Scenario: Backend fails
- **WHEN** the selected recogniser fails
- **THEN** the plugin reports its error without uploading audio or silently falling back to another model

#### Scenario: Compare backend performance
- **WHEN** the backends are evaluated for release
- **THEN** the same recordings, hardware and cold/warm conditions are used, and latency, memory and technical-vocabulary errors are reported separately
