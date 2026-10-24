import assert from 'node:assert/strict'
import test from 'node:test'
import { InputRenderable, TextareaRenderable } from '@opentui/core'
import { activePromptTarget, capturePromptTarget, insertTranscript } from '../src/host.mjs'

function editor(text, cursor, { selected = false, characterOffset = true } = {}) {
  const value = {
    plainText: text,
    cursorOffset: cursor,
    hasSelection: () => selected,
    insertions: [],
    insertText(insertion) {
      this.insertions.push(insertion)
      this.plainText = `${this.plainText.slice(0, cursor)}${insertion}${this.plainText.slice(cursor)}`
      this.cursorOffset = cursor + insertion.length
      this.cursorCharacterOffset = this.cursorOffset
    },
  }
  if (characterOffset) value.cursorCharacterOffset = cursor
  return value
}

test('inserts into empty prompts and preserves cursor boundaries in existing drafts', () => {
  const cases = [
    { text: '', cursor: 0, expected: 'synthetic transcript', expectedCursor: 20 },
    { text: 'world', cursor: 0, expected: 'synthetic transcript world', expectedCursor: 21 },
    { text: 'hello world', cursor: 5, expected: 'hello synthetic transcript world', expectedCursor: 26 },
    { text: 'hello', cursor: 5, expected: 'hello synthetic transcript', expectedCursor: 26 },
  ]

  for (const { text, cursor, expected, expectedCursor } of cases) {
    const target = editor(text, cursor)
    assert.equal(insertTranscript(target, ' synthetic transcript '), true)
    assert.equal(target.plainText, expected)
    assert.equal(target.cursorOffset, expectedCursor)
    assert.equal(target.insertions.length, 1)
  }
})

test('uses the editor character offset for Unicode cursor placement', () => {
  const target = editor('😀ok', 2)
  assert.equal(insertTranscript(target, 'synthetic transcript'), true)
  assert.equal(target.plainText, '😀 synthetic transcript ok')
  assert.equal(target.cursorOffset, 24)
})

test('uses the editor cursor offset fallback when character offset is unavailable', () => {
  const target = editor('hello', 2, { characterOffset: false })
  assert.equal(insertTranscript(target, 'synthetic transcript'), true)
  assert.equal(target.plainText, 'he synthetic transcript llo')
})

test('refuses a selection and ignores empty transcripts without editing', () => {
  const selected = editor('draft', 2, { selected: true })
  assert.throws(() => insertTranscript(selected, 'synthetic transcript'), /Clear the selected text/u)
  assert.deepEqual(selected.insertions, [])

  const empty = editor('draft', 2)
  assert.equal(insertTranscript(empty, '  \n  '), false)
  assert.equal(empty.plainText, 'draft')
  assert.deepEqual(empty.insertions, [])
})

function context({ route = { type: 'home' }, mode = 'base', status = 'idle', focused = true } = {}) {
  const editor = focused ? Object.create(TextareaRenderable.prototype) : undefined
  if (editor) Object.defineProperty(editor, 'isDestroyed', { value: false })
  return {
    editor,
    context: {
      ui: { router: { current: () => route } },
      keymap: { mode: { current: () => mode } },
      data: { session: { status: () => status } },
      renderer: { get currentFocusedEditor() { return editor } },
    },
  }
}

test('starts only on a normal prompt route with a focused textarea and idle session', () => {
  const home = context()
  assert.equal(activePromptTarget(home.context, 'normal')?.editor, home.editor)

  const session = context({ route: { type: 'session', sessionID: 'session-1' } })
  assert.equal(activePromptTarget(session.context, 'normal')?.editor, session.editor)

  for (const blocked of [
    context({ route: { type: 'dialog' } }),
    context({ mode: 'modal' }),
    context({ mode: 'autocomplete' }),
    context({ mode: 'session.form' }),
    context({ focused: false }),
    context({ route: { type: 'session', sessionID: 'session-1' }, status: 'busy' }),
  ]) {
    assert.equal(activePromptTarget(blocked.context, 'normal'), undefined)
  }

  const shell = context()
  assert.equal(activePromptTarget(shell.context, 'shell'), undefined)
  assert.equal(activePromptTarget(shell.context, undefined), undefined)
})

test('refuses single-line input renderables even when they are focused', () => {
  const focusedInput = Object.create(InputRenderable.prototype)
  Object.defineProperty(focusedInput, 'isDestroyed', { value: false })
  const { context: host } = context()
  host.renderer = { currentFocusedEditor: focusedInput }
  assert.equal(activePromptTarget(host, 'normal'), undefined)
})

test('captured prompt is invalidated by route, focus, draft, cursor or editor changes', () => {
  let route = { type: 'session', sessionID: 'one' }
  let mode = 'normal'
  let focused
  let text = 'unchanged draft'
  let cursor = 4
  const textarea = Object.create(TextareaRenderable.prototype)
  Object.defineProperties(textarea, {
    isDestroyed: { get: () => destroyed },
    plainText: { get: () => text },
    cursorOffset: { get: () => cursor },
    cursorCharacterOffset: { get: () => cursor },
  })
  let destroyed = false
  focused = textarea
  const host = {
    ui: { router: { current: () => route } },
    keymap: { mode: { current: () => 'base' } },
    data: { session: { status: () => 'idle' } },
    renderer: { get currentFocusedEditor() { return focused } },
  }
  const capture = () => capturePromptTarget(host, () => mode)

  let target = capture()
  assert.equal(target.isCurrent(), true)
  mode = 'shell'
  assert.equal(target.isCurrent(), false)
  mode = 'normal'

  target = capture()
  text = 'externally changed'
  assert.equal(target.isCurrent(), false)
  text = 'unchanged draft'

  target = capture()
  cursor = 5
  assert.equal(target.isCurrent(), false)
  cursor = 4

  target = capture()
  route = { type: 'session', sessionID: 'two' }
  assert.equal(target.isCurrent(), false)
  route = { type: 'session', sessionID: 'one' }

  target = capture()
  focused = Object.create(TextareaRenderable.prototype)
  Object.defineProperty(focused, 'isDestroyed', { value: false })
  assert.equal(target.isCurrent(), false)
  focused = textarea

  target = capture()
  destroyed = true
  assert.equal(target.isCurrent(), false)
})
