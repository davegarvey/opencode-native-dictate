import { insertTranscript } from './host.mjs'

/** Owns one capture/transcription request and ignores all work from invalidated sessions. */
export class Dictation {
  state = 'idle'
  generation = 0
  session
  disposed = false
  cleanupPromises = new WeakMap()

  constructor(backend, changed = () => {}, failed = () => {}, options = {}) {
    this.backend = backend
    this.changed = changed
    this.failed = failed
    this.maxDurationMs = options.maxDurationMs ?? 15 * 60 * 1000
    this.insert = options.insert ?? ((target, text) => insertTranscript(target?.editor ?? target, text))
  }

  update(state, detail = {}) {
    this.state = state
    this.changed({ state, ...detail })
  }

  isCurrent(session) {
    return !this.disposed && this.session === session && this.generation === session.generation
  }

  isTargetCurrent(session) {
    const editor = session.target.editor ?? session.target
    return !editor.isDestroyed && (session.target.isCurrent?.() ?? true)
  }

  async start(target) {
    if (this.disposed || this.state !== 'idle' || !target) return false
    const editor = target.editor ?? target
    if (editor.isDestroyed) return false

    const session = {
      generation: ++this.generation,
      target,
      abort: new AbortController(),
      recording: undefined,
      timer: undefined,
      guardTimer: undefined,
      cleanupPromise: undefined,
      stopPromise: undefined,
    }
    this.session = session
    this.update('starting')
    session.guardTimer = setInterval(() => {
      if (this.isCurrent(session) && !this.isTargetCurrent(session)) this.cancel()
    }, 50)
    session.guardTimer.unref?.()

    try {
      const recording = await this.backend.record(session.abort.signal, event => {
        if (!this.isCurrent(session)) return
        if (event?.type === 'error') {
          if (this.state === 'starting' || this.state === 'recording') {
            this.fail(new Error(event.message || 'Microphone capture failed.'), session)
          }
          return
        }
        if (event?.type === 'level' && this.state === 'recording') this.changed({ state: 'recording', ...event })
      })
      if (!this.isCurrent(session)) {
        await this.cleanupRecording(recording)
        return false
      }
      if (!this.isTargetCurrent(session)) {
        session.recording = recording
        this.cancel()
        return false
      }
      session.recording = recording
      this.update('recording')
      if (this.maxDurationMs > 0) {
        session.timer = setTimeout(() => {
          if (this.isCurrent(session) && this.state === 'recording') {
            void this.stop('duration-limit')
          }
        }, this.maxDurationMs)
        session.timer.unref?.()
      }
      return true
    } catch (error) {
      this.fail(error, session)
      return false
    }
  }

  stop(reason = 'user') {
    const session = this.session
    if (!session || !this.isCurrent(session) || this.state !== 'recording') return session?.stopPromise ?? Promise.resolve(false)
    if (!this.isTargetCurrent(session)) {
      this.cancel()
      return Promise.resolve(false)
    }
    if (session.stopPromise) return session.stopPromise

    clearTimeout(session.timer)
    session.timer = undefined
    this.update('transcribing', { reason })
    session.stopPromise = this.finish(session, reason)
    return session.stopPromise
  }

  async finish(session, reason) {
    try {
      const audio = await session.recording.stop()
      if (!this.isCurrent(session)) return false
      const transcript = await this.backend.transcribe(audio, session.abort.signal)
      if (!this.isCurrent(session)) return false
      await this.cleanupRecording(session.recording)
      if (!this.isCurrent(session)) return false
      if (!this.isTargetCurrent(session)) {
        this.cancel()
        return false
      }
      const editor = session.target.editor ?? session.target
      if (editor.isDestroyed) throw new Error('The prompt closed before dictation finished.')
      const inserted = this.insert(session.target, transcript)
      if (!inserted) this.changed({ state: 'transcribing', message: 'No speech detected.' })
      if (!this.isCurrent(session)) return false
      if (session.guardTimer) clearInterval(session.guardTimer)
      session.guardTimer = undefined
      this.session = undefined
      this.update('idle', { reason, message: inserted ? 'Transcript ready to edit.' : 'No speech detected.' })
      return inserted
    } catch (error) {
      this.fail(error, session)
      return false
    } finally {
      if (this.isCurrent(session) && this.state !== 'recording') {
        await this.cleanupRecording(session.recording)
      }
    }
  }

  fail(error, session) {
    if (!this.isCurrent(session)) return
    this.invalidate(session)
    this.failed(error instanceof Error ? error : new Error(String(error)))
  }

  invalidate(session) {
    if (session.timer) clearTimeout(session.timer)
    session.timer = undefined
    if (session.guardTimer) clearInterval(session.guardTimer)
    session.guardTimer = undefined
    ++this.generation
    this.session = undefined
    session.abort.abort()
    void this.cleanupRecording(session.recording)
    this.update('idle')
  }

  cancel() {
    const session = this.session
    if (!session) return false
    this.invalidate(session)
    return true
  }

  cleanupRecording(recording) {
    if (!recording) return Promise.resolve()
    const existing = this.cleanupPromises.get(recording)
    if (existing) return existing
    let result
    try { result = recording.cleanup?.() } catch (error) { result = Promise.reject(error) }
    const cleanup = Promise.resolve(result)
    this.cleanupPromises.set(recording, cleanup)
    if (this.session?.recording === recording) this.session.cleanupPromise = cleanup
    return cleanup
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancel()
    this.backend.dispose?.()
  }
}
