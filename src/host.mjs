import { InputRenderable, TextareaRenderable } from '@opentui/core'

/**
 * Version-specific OpenCode 2.1.4 host boundary. OpenCode does not expose a
 * prompt handle, so this accepts a focused multiline editor only while the
 * documented prompt footer is in normal mode and the TUI is on a prompt route.
 */
export function activePromptTarget(context, promptMode, {allowBusySession = false} = {}) {
  const route = context.ui.router.current()
  if (route.type !== 'home' && route.type !== 'session') return undefined
  if (promptMode !== 'normal' || context.keymap.mode.current() !== 'base') return undefined
  if (!allowBusySession && route.type === 'session' && context.data.session.status(route.sessionID) !== 'idle') return undefined

  const editor = context.renderer.currentFocusedEditor
  if (!(editor instanceof TextareaRenderable) || editor instanceof InputRenderable || editor.isDestroyed) return undefined
  return { editor, route }
}

/** Capture prompt identity plus text/cursor revision for a dictation session. */
export function capturePromptTarget(context, getPromptMode, options) {
  const target = activePromptTarget(context, getPromptMode(), options)
  if (!target) return undefined
  const editor = target.editor
  const routeKey = `${target.route.type}:${target.route.sessionID ?? ''}`
  const text = editor.plainText
  const cursor = editor.cursorCharacterOffset ?? editor.cursorOffset
  return {
    ...target,
    text,
    cursor,
    isCurrent() {
      const current = activePromptTarget(context, getPromptMode(), options)
      if (!current || current.editor !== editor || editor.isDestroyed) return false
      const currentRouteKey = `${current.route.type}:${current.route.sessionID ?? ''}`
      return currentRouteKey === routeKey && editor.plainText === text &&
        (editor.cursorCharacterOffset ?? editor.cursorOffset) === cursor
    },
  }
}

export function insertTranscript(editor, transcript) {
  if (editor.hasSelection()) throw new Error('Clear the selected text before dictating.')
  const text = transcript.trim()
  if (!text) return false

  // OpenTUI exposes cursorCharacterOffset for mapping its visual cursor back
  // to a plain-text string offset. Insert through the editor so undo and
  // prompt-part extmarks follow the normal edit path.
  const cursor = editor.cursorCharacterOffset ?? editor.cursorOffset
  const before = editor.plainText
  const prefix = before.slice(0, cursor)
  const suffix = before.slice(cursor)
  const insertion = `${prefix && !/\s$/u.test(prefix) ? ' ' : ''}${text}${suffix && !/^\s/u.test(suffix) ? ' ' : ''}`
  editor.insertText(insertion)
  return true
}
