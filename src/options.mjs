const BACKENDS = new Set(['parakeet', 'qwen3-asr'])
const ALLOWED_OPTIONS = new Set(['backend', 'binding', 'deviceUID', 'python', 'idleMs', 'startupTimeoutMs', 'recognitionTimeoutMs'])

function optionalString(options, key, {absolutePath = false} = {}) {
  const value = options[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/u.test(value)) {
    throw new Error(`Native Dictate option '${key}' must be a non-empty string.`)
  }
  if (absolutePath && !value.startsWith('/')) {
    throw new Error(`Native Dictate option '${key}' must be an absolute path.`)
  }
  return value.trim()
}

function boundedInteger(options, key, fallback, minimum, maximum) {
  const value = options[key] ?? fallback
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Native Dictate option '${key}' must be an integer from ${minimum} to ${maximum}.`)
  }
  return value
}

/** Validate user-controlled plugin options without making OpenCode fail to load. */
export function validateOptions(input = {}) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Native Dictate options must be an object.')
    const unsupported = Object.keys(input).find(key => !ALLOWED_OPTIONS.has(key))
    if (unsupported) throw new Error(`Unknown Native Dictate option '${unsupported}'.`)
    const backend = input.backend ?? 'parakeet'
    if (!BACKENDS.has(backend)) throw new Error("Native Dictate option 'backend' must be 'parakeet' or 'qwen3-asr'.")
    const binding = optionalString(input, 'binding')
    if (binding && !/^(?:<leader>)?[A-Za-z0-9._-]+(?:\+[A-Za-z0-9._-]+)*$/u.test(binding)) {
      throw new Error("Native Dictate option 'binding' has invalid key syntax; use an OpenCode key name such as 'ctrl+shift+d' or '<leader>d'.")
    }
    return {
      options: {
        backend,
        binding,
        deviceUID: optionalString(input, 'deviceUID'),
        python: optionalString(input, 'python', {absolutePath: true}),
        idleMs: boundedInteger(input, 'idleMs', 120_000, 0, 3_600_000),
        startupTimeoutMs: boundedInteger(input, 'startupTimeoutMs', 120_000, 1_000, 600_000),
        recognitionTimeoutMs: boundedInteger(input, 'recognitionTimeoutMs', 300_000, 1_000, 1_800_000),
      },
    }
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)}
  }
}
