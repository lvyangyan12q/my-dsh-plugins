/**
 * Importance gate for a day's candidates.
 *
 * The list adapters answer "what appeared today", not "what is worth reading".
 * A vulnerability-bounty announcement, a hiring post or a niche benchmark notes
 * entry is a valid new post and a poor daily pick. This module asks the
 * configured chat model to score each candidate 0–10 and the selector then
 * keeps only the ones that clear the bar.
 *
 * Design rules:
 *
 * - The model only ever sees title, venue and a short summary; it never sees
 *   the article body, so the call stays one small request per candidate batch.
 * - Scoring is advisory. A missing endpoint, a malformed answer or a thrown
 *   request leaves the candidates unscored and the run continues on the
 *   existing ranking, because a failed gate must never produce an empty digest.
 * - The score is written onto the candidate (`importance`) so the run record and
 *   tests can explain why an item was kept or dropped.
 */
import { chatCompletionsUrl, resolveLlmSettings } from '../translate/llm.js'

export const DEFAULT_IMPORTANCE = Object.freeze({
  enabled: false,
  minScore: 6,
  strongScore: 9,
  maxOverflow: 3,
  batchSize: 20,
  // The gate sees a few dozen short summaries a day, so it can afford a
  // stronger model than the bulk translator uses. `null` means "same as
  // translation".
  model: null,
  baseUrl: null,
})

/** The prompt asks for one JSON object per line: inexpensive to parse, tolerant of prose. */
export function buildImportanceMessages(candidates) {
  const lines = candidates.map((candidate, index) => {
    const summary = String(candidate.summary ?? '').replace(/\s+/g, ' ').slice(0, 280)
    return [
      `[${index}] source=${candidate.sourceId ?? 'unknown'}`,
      `kind=${candidate.kind ?? 'paper'}`,
      `title=${String(candidate.title ?? '').replace(/\s+/g, ' ')}`,
      summary ? `summary=${summary}` : '',
    ].filter(Boolean).join(' | ')
  })

  return [
    {
      role: 'system',
      content: [
        'You are a ruthless editor for a busy AI engineer who reads at most a few items a day.',
        'Score each item 0-10 by how much it deserves their limited reading time.',
        '',
        'RATE HIGH (8-10): a new frontier model or major capability jump; a significant benchmark',
        'that changes what is believed possible; a widely used open-source release; a method that',
        'changes how practitioners build. The test: would a good engineer regret missing it a month later?',
        '',
        'RATE MIDDLE (5-7): a solid research contribution in a busy area; an official post explaining',
        'a real technical decision; a new tool or API with genuine capability behind it.',
        '',
        'RATE LOW (0-4): customer stories and case studies; partnerships, acquisitions, funding and',
        'sponsorships; bug-bounty and security-program announcements; hiring, events, policy, ethics',
        'statements and industry surveys; listicles, recaps and "news roundup" posts; incremental',
        'product tweaks and UI changes; tutorials and how-to posts; niche or very narrow benchmarks.',
        '',
        'A company blog post is NOT automatically important: most of them are marketing.',
        'A model release IS important even when the post is short.',
        '',
        'Reply with one JSON object per line and nothing else:',
        '{"id": <index>, "score": <0-10>, "why": "<8 words max>"}',
      ].join('\n'),
    },
    { role: 'user', content: lines.join('\n') },
  ]
}

/**
 * Parse `{"id":n,"score":s,...}` lines into an index → score map.
 * Unparseable lines are skipped; a score outside 0–10 is clamped.
 */
export function parseImportance(content, expected) {
  const scores = new Map()
  const text = typeof content === 'string' ? content : ''
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    let value
    try {
      value = JSON.parse(match[0])
    } catch {
      continue
    }
    const id = Number(value?.id)
    const score = Number(value?.score)
    if (!Number.isInteger(id) || id < 0 || id >= expected) continue
    if (!Number.isFinite(score)) continue
    scores.set(id, Math.max(0, Math.min(10, score)))
  }
  return scores
}

/** One chat call; returns the assistant text or throws. */
async function askOnce({ settings, messages, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetchImpl(chatCompletionsUrl(settings.baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        stream: false,
        messages,
      }),
    })
    if (!response.ok) {
      throw Object.assign(new Error(`importance endpoint answered HTTP ${response.status}`), {
        code: 'importance_http',
        status: response.status,
      })
    }
    const payload = typeof response.json === 'function' ? await response.json() : null
    return String(payload?.choices?.[0]?.message?.content ?? '')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Score every candidate, newest list order preserved.
 *
 * Returns `{ scored, failed, reason }`. `scored` is the same array with an
 * `importance` field on the candidates the model rated; unscored candidates
 * keep no field and the selector treats them as "unknown", not as "bad".
 */
export async function scoreImportance({
  candidates,
  config = {},
  env = {},
  fetchImpl,
  settings = null,
  now = () => new Date(),
} = {}) {
  const options = { ...DEFAULT_IMPORTANCE, ...(config.selection?.importance ?? {}) }
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : []
  if (options.enabled !== true) return { scored: list, failed: false, reason: 'disabled' }
  if (list.length === 0) return { scored: list, failed: false, reason: 'no_candidates' }
  if (typeof fetchImpl !== 'function') return { scored: list, failed: true, reason: 'no_fetch' }

  const resolved = settings ?? resolveLlmSettings(env, config)
  if (!resolved?.configured) return { scored: list, failed: true, reason: 'llm_not_configured' }

  // The gate may pin its own model: a small, strong model here keeps the
  // judgement sharp while the bulk translator stays on the cheap one.
  const gate = {
    ...resolved,
    model: typeof options.model === 'string' && options.model ? options.model : resolved.model,
    baseUrl: typeof options.baseUrl === 'string' && options.baseUrl ? options.baseUrl : resolved.baseUrl,
  }
  const batchSize = Number.isInteger(options.batchSize) && options.batchSize > 0 ? options.batchSize : DEFAULT_IMPORTANCE.batchSize
  const scored = [...list]
  let rated = 0

  for (let start = 0; start < scored.length; start += batchSize) {
    const slice = scored.slice(start, start + batchSize)
    try {
      const content = await askOnce({
        settings: gate,
        messages: buildImportanceMessages(slice),
        fetchImpl,
      })
      const scores = parseImportance(content, slice.length)
      for (const [index, score] of scores) {
        const target = slice[index]
        if (target) {
          target.importance = score
          rated += 1
        }
      }
    } catch (error) {
      return {
        scored,
        failed: rated === 0,
        reason: rated === 0 ? String(error?.code ?? error?.message ?? error) : 'partial',
        scoredAt: now().toISOString(),
      }
    }
  }

  return {
    scored,
    failed: rated === 0,
    reason: rated === 0 ? 'no_scores' : 'ok',
    rated,
    scoredAt: now().toISOString(),
  }
}
