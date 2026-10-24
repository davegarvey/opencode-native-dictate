import { Plugin } from '@opencode/plugin/tui'
import { createSignal } from 'solid-js'
import { activePromptTarget, capturePromptTarget, insertTranscript } from './host.mjs'
import { installBusyInputGuard } from './input-guard.mjs'
import { Dictation } from './controller.mjs'
import { Backend } from './backend.mjs'
import { validateOptions } from './options.mjs'
import { footerStatus, STATUS_TICK_MS } from './status.mjs'

const SYNTHETIC_TRANSCRIPT = 'synthetic transcript'

export default Plugin.define({
  id: 'opencode-native-dictate',
  setup(context) {
    const [promptMode, setPromptMode] = createSignal<'normal' | 'shell' | undefined>(undefined)
    const [sessionState, setSessionState] = createSignal<'idle' | 'starting' | 'recording' | 'transcribing' | 'completed'>('idle')
    const [elapsedMs, setElapsedMs] = createSignal(0)
    const [meterLevel, setMeterLevel] = createSignal(0)
    let pendingStop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let guardTimer: ReturnType<typeof setInterval> | undefined
    let statusTimer: ReturnType<typeof setInterval> | undefined
    let recordingStartedAt = 0
    let fakeTarget: ReturnType<typeof capturePromptTarget>
    let disposed = false
    let realSession = false
    let dictation: Dictation | undefined
    let elapsedTimer: ReturnType<typeof setInterval> | undefined
    const showNotice = (message: string, variant: 'info' | 'warning' | 'error' = 'error') => context.ui.toast.show({
      title: 'Dictation',
      message,
      variant,
      duration: 4000,
    })
    const validation = validateOptions(context.options ?? {})
    const pluginOptions: Record<string, any> = validation.options ?? {backend: 'parakeet'}

    const clearGuardTimer = () => {
      if (guardTimer) clearInterval(guardTimer)
      guardTimer = undefined
    }

    const clearElapsedTimer = () => {
      if (elapsedTimer) clearInterval(elapsedTimer)
      elapsedTimer = undefined
    }

    if (validation.error) showNotice(validation.error)
    else dictation = new Dictation(new Backend({
      backend: pluginOptions.backend ?? 'parakeet',
      deviceUID: pluginOptions.deviceUID,
      python: pluginOptions.python,
      idleMs: pluginOptions.idleMs,
      startupTimeoutMs: pluginOptions.startupTimeoutMs,
      recognitionTimeoutMs: pluginOptions.recognitionTimeoutMs,
    }), (event?: any) => {
      if (disposed) return
      const previousState = sessionState()
      setSessionState(event.state)
      if (event.state === 'recording' && previousState !== 'recording') {
        if (!recordingStartedAt) recordingStartedAt = Date.now()
        setElapsedMs(Date.now() - recordingStartedAt)
        setMeterLevel(0)
        clearElapsedTimer()
        elapsedTimer = setInterval(() => setElapsedMs(Date.now() - recordingStartedAt), STATUS_TICK_MS)
      } else if (event.state === 'transcribing') {
        clearElapsedTimer()
      } else if (event.state === 'idle') {
        clearElapsedTimer()
        if (event.message === 'No speech detected.') showNotice(event.message, 'info')
        if (event.reason === 'duration-limit') showNotice('The 15-minute recording limit was reached. Review the transcript.', 'warning')
        realSession = false
      }
      if (event.type === 'level' && Number.isFinite(event.db)) {
        setMeterLevel(Math.max(0, Math.min(1, (event.db + 60) / 45)))
      }
    }, (error?: any) => {
      if (disposed) return
      realSession = false
      clearElapsedTimer()
      showNotice(error.message)
    })

    const startDictation = () => {
      if (disposed || sessionState() !== 'idle') return
      if (validation.error) {
        showNotice(validation.error)
        return
      }
      const target = capturePromptTarget(context, promptMode)
      if (!target) {
        showNotice('Focus the normal, editable prompt before starting dictation.')
        return
      }
      if (target.editor.hasSelection()) {
        showNotice('Clear the selected text before dictating.')
        return
      }
      realSession = true
      pendingStop = false
      recordingStartedAt = 0
      void dictation?.start(target).then(() => {
        if (pendingStop && dictation?.state === 'recording') {
          pendingStop = false
          void dictation.stop('user')
        }
      })
    }

    const transcribeFake = (editor: Parameters<typeof insertTranscript>[0]) => {
      if (sessionState() !== 'recording') return
      setSessionState('transcribing')
      if (statusTimer) clearInterval(statusTimer)
      statusTimer = undefined
      timer = setTimeout(() => {
        timer = undefined
        if (sessionState() !== 'transcribing') return
        if (!fakeTarget?.isCurrent()) {
          setSessionState('completed')
          clearGuardTimer()
          return
        }
        try {
          insertTranscript(editor, SYNTHETIC_TRANSCRIPT)
        } catch (error) {
          showNotice(error instanceof Error ? error.message : String(error))
        }
        setSessionState('completed')
        clearGuardTimer()
      }, 1200)
    }

    const removeInputGuard = installBusyInputGuard(context.renderer, sessionState, {
      enter() {
        if (sessionState() === 'starting') {
          pendingStop = true
          return
        }
        if (sessionState() === 'recording' && realSession) {
          pendingStop = false
          void dictation?.stop('user')
          return
        }
        if (sessionState() === 'recording' && fakeTarget) transcribeFake(fakeTarget.editor)
      },
      escape() {
        if (realSession) {
          dictation?.cancel()
          realSession = false
          clearElapsedTimer()
          return
        }
        if (timer) clearTimeout(timer)
        timer = undefined
        if (statusTimer) clearInterval(statusTimer)
        statusTimer = undefined
        clearGuardTimer()
        pendingStop = false
        setSessionState('idle')
      },
      release() {
        if (sessionState() === 'completed') setSessionState('idle')
      },
    })
    const startFakeSession = () => {
      if (disposed) return
      const target = capturePromptTarget(context, promptMode)
      if (!target) {
        showNotice('Focus the normal prompt before starting the safety probe.')
        return
      }
      if (sessionState() !== 'idle') return
      fakeTarget = target
      if (guardTimer) clearInterval(guardTimer)
      guardTimer = setInterval(() => {
        if (sessionState() !== 'idle' && sessionState() !== 'completed' && !fakeTarget?.isCurrent()) {
          if (timer) clearTimeout(timer)
          timer = undefined
          if (statusTimer) clearInterval(statusTimer)
          statusTimer = undefined
          clearGuardTimer()
          pendingStop = false
          setSessionState('idle')
        }
      }, 50)
      pendingStop = false
      setSessionState('starting')
      timer = setTimeout(() => {
        timer = undefined
        if (sessionState() !== 'starting') return
        setSessionState('recording')
        recordingStartedAt = Date.now()
        setElapsedMs(0)
        let phase = 0
        statusTimer = setInterval(() => {
          phase = (phase + 1) % 20
          setMeterLevel(phase < 10 ? phase / 10 : (20 - phase) / 10)
          setElapsedMs(Date.now() - recordingStartedAt)
        }, STATUS_TICK_MS)
        if (pendingStop) transcribeFake(target.editor)
      }, 600)
    }

    context.ui.slot({
      append: 'prompt.footer.status',
      render: (input) => {
        if (promptMode() !== input.mode) setPromptMode(input.mode)
        const state = sessionState()
        const status = footerStatus({ state, elapsedMs: elapsedMs(), level: meterLevel(), width: context.renderer.width })
        const color = state === 'recording' ? context.theme.text.success : context.theme.text.warning
        return status ? <text fg={color}>{status}</text> : null
      },
    })

    context.keymap.layer(() => ({
      mode: 'global',
      priority: 1000,
      commands: [{
        id: 'dictation.start',
        title: 'Start local dictation',
        description: 'Record speech locally and insert the transcript at the prompt cursor',
        group: 'Dictation',
        palette: true,
        slash: { name: 'dictate-start' },
        bind: typeof pluginOptions.binding === 'string' && pluginOptions.binding.trim()
          ? pluginOptions.binding.trim()
          : '<leader>d',
        run: () => startDictation(),
      }],
    }))

    context.keymap.layer(() => ({
      mode: 'global',
      priority: 1000,
      commands: [{
        id: 'dictation.probe',
        title: 'Insert synthetic dictation transcript',
        description: 'Exercise the OpenCode prompt insertion adapter without microphone access',
        group: 'Dictation',
        run: () => {
          if (disposed) return
          const target = activePromptTarget(context, promptMode())
          if (!target) {
            showNotice('Focus the normal prompt before inserting the synthetic transcript.')
            return
          }
          try {
            insertTranscript(target.editor, SYNTHETIC_TRANSCRIPT)
          } catch (error) {
            showNotice(error instanceof Error ? error.message : String(error))
          }
        },
      }],
    }))

    context.keymap.layer(() => ({
      mode: 'global',
      priority: 1000,
      commands: [{
        id: 'dictation.fake-session',
        title: 'Start delayed dictation safety probe',
        description: 'Exercise Enter/Escape interception using a fake delayed backend',
        group: 'Dictation',
        run: () => {
          if (disposed) return
          startFakeSession()
        },
      }],
    }))

    return () => {
      if (disposed) return
      disposed = true
      if (timer) clearTimeout(timer)
      clearGuardTimer()
      if (statusTimer) clearInterval(statusTimer)
      clearElapsedTimer()
      pendingStop = false
      fakeTarget = undefined
      removeInputGuard()
      dictation?.dispose()
      setSessionState('idle')
      setPromptMode(undefined)
    }
  },
})
