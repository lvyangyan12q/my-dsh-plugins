/**
 * Shared Hugging Face fixtures for the pipeline tests.
 *
 * `HF_PAYLOAD` is a captured-shape `api/daily_papers?date=` response: a JSON
 * array of `{ paper: {...} }` wrappers, deliberately not ordered by upvotes so
 * the adapter's own ordering is observable. Nothing here touches the network.
 */
import { readFileSync } from 'node:fs'

export const HF_PAYLOAD = readFileSync(new URL('../fixtures/hf-daily-papers.json', import.meta.url), 'utf8')
export const HF_JSON = JSON.parse(HF_PAYLOAD)

/** A fetch double that answers the daily-list request with one payload. */
export function fakeHf({ payload = HF_PAYLOAD, status = 200, fail = null } = {}) {
  const calls = []
  const impl = async (url) => {
    calls.push(String(url))
    if (fail) throw fail
    return { ok: status >= 200 && status < 300, status, text: async () => payload }
  }
  return { impl, calls }
}
