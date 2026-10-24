# Dictation Session

## Purpose

Let users dictate into OpenCode's existing prompt with native terminal controls while preserving their draft and retaining explicit control over submission.

## ADDED Requirements

### Requirement: Start only in the active prompt
The plugin SHALL start one recording from a configurable keyboard shortcut only when an editable OpenCode prompt owns focus. It MUST NOT start in a dialog, search field, shell-mode prompt, disabled prompt or another editor. Repeated start events MUST NOT create concurrent sessions.

#### Scenario: Begin with an existing draft
- **WHEN** the shortcut is pressed in an editable prompt containing text
- **THEN** one recording starts and the draft, cursor and attached prompt parts remain intact

#### Scenario: Use the default leader chord
- **WHEN** no custom shortcut is configured and the user presses OpenCode's leader key (Ctrl+X by default), then D
- **THEN** dictation starts without inserting the D key into the prompt

#### Scenario: Shortcut outside the prompt
- **WHEN** the shortcut is pressed in a dialog or shell-mode prompt
- **THEN** no recording starts and the focused control retains its normal behavior

#### Scenario: Shortcut repeats
- **WHEN** a held start shortcut produces repeated events
- **THEN** only one session exists and it is not immediately stopped by key repeat

### Requirement: Display truthful session status
During a session, the prompt area SHALL show a compact indicator for initialization, recording and transcription. Recording status SHALL show elapsed time and a voice-responsive audio-level meter refreshed at least five times per second. It MUST NOT indicate active capture before microphone readiness is confirmed. Failures SHALL use brief actionable notifications.

#### Scenario: Recording is ready
- **WHEN** capture reports readiness and changing audio levels
- **THEN** a compact prompt-footer indicator displays recording status, elapsed time and a changing meter, while the host's other footer details remain visible

#### Scenario: Model loading
- **WHEN** capture has stopped and recognition is loading or running
- **THEN** a compact indicator displays transcription progress and no longer indicates an active microphone

### Requirement: Preserve host footer details
While idle or after completion, the plugin MUST leave the host footer status area empty so OpenCode's path, branch and other status details remain visible. It MUST NOT send persistent status messages through the footer.

#### Scenario: Idle and completed sessions
- **WHEN** the plugin is idle or dictation has completed
- **THEN** it adds no persistent footer text and OpenCode's path and branch details remain visible

#### Scenario: Session failure
- **WHEN** capture or recognition fails
- **THEN** the plugin shows one brief actionable notification and returns to an empty footer status

### Requirement: Stop without submitting
Enter during recording SHALL stop capture and initiate recognition exactly once. Enter during initialization or transcription SHALL be consumed without submitting or queueing submission. A fresh Enter after completion SHALL use OpenCode's normal behavior; key repeat from the stop key MUST NOT submit.

#### Scenario: Stop and review
- **WHEN** Enter stops recording and recognition completes
- **THEN** text is available to edit and no message has been submitted

#### Scenario: Enter repeats across completion
- **WHEN** Enter is held or repeated while recognition finishes
- **THEN** no prompt is submitted until a distinct subsequent user submission action

### Requirement: Cancel without changing the draft
Escape during initialization, recording or transcription SHALL cancel the session, discard its audio and pending recognition, and leave the original prompt text, cursor and attachments unchanged. Cancellation SHALL remain responsive while the model loads or runs.

#### Scenario: Cancel an active recording
- **WHEN** Escape is pressed after speaking
- **THEN** recording stops, the draft is unchanged and ordinary editing resumes

#### Scenario: Cancel while inference is pending
- **WHEN** Escape is pressed and the backend later returns a transcript
- **THEN** the late result is ignored and no text is inserted

### Requirement: Preserve existing prompt content
Successful dictation SHALL insert at the original cursor without replacing pre-existing text or prompt parts. It SHALL use the editor's normal change and undo behavior and place the cursor after inserted text. Existing selected text MUST NOT be replaced; starting with a nonempty selection SHALL be refused with a brief explanation.

#### Scenario: Insert between words
- **WHEN** the cursor is between existing words and recognition succeeds
- **THEN** the transcript is inserted at that position with boundary spacing that prevents adjacent words joining, leaving the original text in order

#### Scenario: Preserve attachments and Unicode
- **WHEN** a prompt contains file references, pasted blocks, emoji or non-Latin text
- **THEN** insertion preserves those parts and uses the editor's cursor coordinates correctly

#### Scenario: Undo the insertion
- **WHEN** the user invokes normal undo after successful insertion
- **THEN** the transcript insertion can be undone without losing the preceding draft

#### Scenario: Existing selection
- **WHEN** dictation is requested with text selected
- **THEN** the plugin explains that the selection must be cleared and neither records nor changes the draft

### Requirement: Keep capture bound to its originating editor
A session SHALL retain the originating editor and route identity. While active, prompt editing and paste SHALL be blocked without replaying those inputs later. Focus loss, route change, editor destruction or an external draft mutation SHALL cancel pending insertion without restoring stale text over newer edits.

#### Scenario: Switch session during recognition
- **WHEN** the user changes session or another UI takes focus
- **THEN** the recording or recognition is cancelled and neither old nor new prompt receives the result

#### Scenario: External draft mutation
- **WHEN** another component changes the draft during dictation
- **THEN** the plugin leaves that newer draft intact and discards its pending insertion

#### Scenario: Paste during recording
- **WHEN** a paste arrives while recording
- **THEN** it does not alter the draft and is not replayed after recording ends

### Requirement: Support repeated dictation and ordinary editing
The plugin SHALL permit any number of sequential dictations within a prompt, interspersed with typing and editing. Idle dictation SHALL not intercept ordinary Enter, Escape, navigation or editing shortcuts.

#### Scenario: Combine typing and two recordings
- **WHEN** the user types, dictates, edits, dictates again and then submits
- **THEN** both accepted transcripts and the user's edits are present in the normal submitted prompt

### Requirement: Recover from failures
Recording and recognition failures SHALL produce concise actionable feedback, preserve the current draft and return to an idle state after cleanup. Empty or silent input SHALL not insert fabricated text or produce a submission.

#### Scenario: Recognition fails
- **WHEN** recognition times out or its process exits
- **THEN** the draft is unchanged, the error describes a recovery action and another dictation can be started

#### Scenario: No speech
- **WHEN** the recording contains no detected speech or recognition yields empty text
- **THEN** the plugin reports no speech detected and leaves the draft unchanged
