# Microphone capture

The native macOS helper lists input devices with `bin/recorder --list-devices`. It uses the system's current default input unless `deviceUID` is configured in the plugin options. A missing configured UID is an error and never falls back to another microphone. The helper checks the selected device's alive state during recording and reports a disconnect.

The helper captures the chosen input, converts it to mono 16 kHz signed 16-bit PCM WAV, and emits its level and elapsed duration. WAV files live in owner-marked mode-0700 temporary directories; the file itself is mode 0600. Successful recognition removes the directory after use, and cancellation deletes it immediately. Directories with unknown or still-running owners are left alone during stale-file cleanup.

The native macOS helper asks for microphone permission when capture starts. macOS cannot dismiss an outstanding permission request programmatically. If the user cancels dictation while the request is pending, the helper invalidates that session; a later permission grant will not start recording.

On denial, the helper reports that access was denied and points to **System Settings → Privacy & Security → Microphone**. Enable access for the app running OpenCode (for example, Ghostty), then restart that app before retrying. The exact app shown by macOS depends on how OpenCode was launched.

The helper's line protocol emits `ready` only after capture starts, periodic `level` events while capture is active, and one terminal `stopped`, `cancelled`, or `error` event. A 15-minute controller limit stops once and proceeds to transcription. Permission-gate tests cover denial, late grant after cancellation, and duplicate permission callbacks. Native tests read back a generated WAV and check its sample rate, channel count, encoding and duration. Build with `npm run build:native`; native tests run with `npm run test:native`.

These checks do not prove that a real microphone is available, that macOS attributes permission to a particular app, that a USB disconnect is handled correctly on hardware, or that audio levels are delivered in Ghostty. Those remain live-machine acceptance checks. In the current restricted build environment, `--list-devices` returned an empty list.
