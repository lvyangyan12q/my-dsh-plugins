/**
 * Fake OpenAI-compatible Chat Completions endpoint.
 *
 * `translate` maps one input text to its fake translation. `misalign` corrupts
 * the reply in the three ways a real model does (`missing`, `extra`,
 * `reorder`); `failTexts` makes any request containing that marker answer HTTP
 * 500. Every call is recorded with its parsed body, so a test can assert how
 * blocks were batched and that no secret was sent anywhere unexpected.
 */
export const MODEL = 'fake-translate-model'
export const API_KEY = 'sk-test-secret-key-do-not-leak'
export const BASE_URL = 'https://llm.example.test/v1'

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    text: async () => message,
    json: async () => ({ error: { message } }),
  }
}

/** Parse the `[{id,text}]` payload the translation service sends. */
export function unitsOf(body) {
  return JSON.parse(body.messages[1].content)
}

export function fakeLlm({
  translate = text => `译:${text}`,
  failTexts = [],
  misalign = null,
  usage = 120,
  failFirst = 0,
  model = MODEL,
} = {}) {
  const calls = []
  let failures = 0

  const impl = async (url, init = {}) => {
    const body = JSON.parse(init.body)
    calls.push({ url: String(url), body, headers: init.headers ?? {} })
    if (failures < failFirst) {
      failures += 1
      return errorResponse(503, 'temporarily unavailable')
    }

    const units = unitsOf(body)
    if (units.some(unit => failTexts.some(marker => unit.text.includes(marker)))) {
      return errorResponse(500, 'the model could not translate that block')
    }

    const outputs = units.map(unit => ({
      id: unit.id,
      translation: translate(unit.text, unit),
    }))
    const mode = typeof misalign === 'function' ? misalign(units, outputs) : misalign
    let content
    if (mode === 'missing') {
      content = JSON.stringify(outputs.slice(0, -1))
    } else if (mode === 'extra') {
      content = JSON.stringify([...outputs, { id: 'u-extra', translation: '多出来的一块' }])
    } else if (mode === 'reorder') {
      content = JSON.stringify([...outputs].reverse())
    } else {
      content = JSON.stringify(outputs)
    }

    return {
      ok: true,
      status: 200,
      text: async () => content,
      json: async () => ({
        model,
        choices: [{ index: 0, message: { role: 'assistant', content } }],
        usage: { prompt_tokens: usage / 2, completion_tokens: usage / 2, total_tokens: usage },
      }),
    }
  }

  return { impl, calls, model }
}
