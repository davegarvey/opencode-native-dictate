/**
 * Consume submit/cancel keys while a dictation session owns prompt input.
 * The public renderer key handler is an EventEmitter; prependListener puts the
 * guard before OpenCode's existing keymap listener and focused editor handlers.
 */
export function installBusyInputGuard(renderer, getState, actions) {
  let enterDown = false
  let escapeDown = false
  let removed = false

  const keypress = (event) => {
    const state = getState()
    if (event.name === 'return') {
      const busy = state !== 'idle' && state !== 'completed'
      if (busy) {
        event.preventDefault()
        event.stopPropagation()
        if (event.eventType !== 'repeat' && !event.repeated) {
          enterDown = true
          actions.enter(event)
        }
        return
      }
      if (enterDown && (event.eventType === 'repeat' || event.repeated)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      enterDown = false
      if (state === 'completed') actions.release?.(event)
      return
    }

    if (event.name === 'escape') {
      if (state !== 'idle' && state !== 'completed') {
        event.preventDefault()
        event.stopPropagation()
        if (event.eventType !== 'repeat' && !event.repeated) {
          escapeDown = true
          actions.escape(event)
        }
        return
      }
      if (state === 'completed') actions.release?.(event)
      if (escapeDown && (event.eventType === 'repeat' || event.repeated)) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        escapeDown = false
      }
      return
    }

    if (state !== 'idle' && state !== 'completed') {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name !== 'escape' && event.eventType !== 'repeat' && !event.repeated) {
      enterDown = false
      escapeDown = false
      if (state === 'completed') actions.release?.(event)
    }

  }

  const paste = (event) => {
    const state = getState()
    if (state === 'idle' || state === 'completed') return
    event.preventDefault()
    event.stopPropagation()
  }

  const keyrelease = (event) => {
    if (event.name === 'return') {
      enterDown = false
      if (getState() === 'completed') actions.release?.(event)
    }
    if (event.name === 'escape') escapeDown = false
  }

  renderer.keyInput.prependListener('keypress', keypress)
  renderer.keyInput.prependListener('paste', paste)
  renderer.keyInput.on('keyrelease', keyrelease)
  return () => {
    if (removed) return
    removed = true
    renderer.keyInput.off('keypress', keypress)
    renderer.keyInput.off('paste', paste)
    renderer.keyInput.off('keyrelease', keyrelease)
    enterDown = false
    escapeDown = false
  }
}
