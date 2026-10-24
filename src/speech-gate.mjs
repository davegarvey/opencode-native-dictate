/**
 * A conservative level gate for rejecting recordings that contain only digital
 * silence. This is deliberately not a substitute for a trained VAD: it learns
 * the lowest recent background level during a short calibration window, then
 * requires sustained energy above that floor. Quiet speech should pass when it
 * is distinguishable from the room noise; ambiguous room noise is left to ASR.
 */
export class SpeechGate {
  constructor({ calibrationMs = 300, minimumThresholdDb = -62, maximumThresholdDb = -42, marginDb = 5, speechMs = 120 } = {}) {
    this.calibrationMs = calibrationMs
    this.minimumThresholdDb = minimumThresholdDb
    this.maximumThresholdDb = maximumThresholdDb
    this.marginDb = marginDb
    this.speechMs = speechMs
    this.elapsedMs = 0
    this.calibrationLevels = []
    this.thresholdDb = undefined
    this.speechDurationMs = 0
    this.speech = false
  }

  observe({ db, bufferMs }) {
    if (!Number.isFinite(db) || !Number.isFinite(bufferMs) || bufferMs <= 0) return this.speech
    const duration = Math.min(bufferMs, 500)
    if (this.thresholdDb === undefined && this.elapsedMs < this.calibrationMs) {
      this.calibrationLevels.push(db)
      this.elapsedMs += duration
      if (this.elapsedMs >= this.calibrationMs) {
        const floor = Math.min(...this.calibrationLevels)
        this.thresholdDb = Math.max(this.minimumThresholdDb, Math.min(this.maximumThresholdDb, floor + this.marginDb))
      }
      // Preserve speech that starts at once; the first buffer window is not
      // guaranteed to contain room-only audio. The later calibrated threshold
      // still filters ordinary low-level room noise.
      if (db >= -50) this.speechDurationMs += duration
      else this.speechDurationMs = Math.max(0, this.speechDurationMs - duration * 2)
    } else {
      if (this.thresholdDb === undefined) this.thresholdDb = this.minimumThresholdDb
      this.elapsedMs += duration
      if (db >= this.thresholdDb) this.speechDurationMs += duration
      else this.speechDurationMs = Math.max(0, this.speechDurationMs - duration * 2)
    }
    if (this.speechDurationMs >= this.speechMs) this.speech = true
    return this.speech
  }
}
