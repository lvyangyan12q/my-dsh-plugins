/** Same-origin practice requests; cached drafts never supply scores or role identity. */
export async function practiceRequest<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch('/api/kaogong/practice/' + action, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  let value: T & { error?: string }
  try { value = JSON.parse(await response.text()) }
  catch { throw new Error('练习服务返回了无法识别的数据') }
  if (!response.ok) throw new Error(value.error ?? `请求失败 (${response.status})`)
  return value
}

const admittedKey = 'kaogong/default/admitted-reviews/v1'
/** Delivery markers suppress repeat sends after native admission when the Host projection must be retried. */
export function readAdmittedReviews(): string[] {
  try { const value: unknown = JSON.parse(window.localStorage.getItem(admittedKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) : [] } catch { return [] }
}
export function markAdmittedReview(roundId: string) { window.localStorage.setItem(admittedKey, JSON.stringify([...new Set([...readAdmittedReviews(), roundId])])) }

const draftKey = 'kaogong/default/practice-draft/v1'
export type PracticeDraft = { roundId: string; answers: Record<string, string>; errorReasons: Record<string, string>; notes: Record<string, string> }
/** Drafts contain learner input and a Host-issued pointer only. Storage failure is explicit. */
export function savePracticeDraft(draft: PracticeDraft) { window.localStorage.setItem(draftKey, JSON.stringify(draft)) }
export function readPracticeDraft(): PracticeDraft | null {
  const raw = window.localStorage.getItem(draftKey)
  if (!raw) return null
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('roundId' in value) || typeof value.roundId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.roundId)) throw new Error('练习草稿已损坏')
  const map = (key: string): Record<string, string> => {
    const entries = Reflect.get(value, key)
    if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.values(entries).some(row => typeof row !== 'string')) return {}
    return Object.fromEntries(Object.entries(entries))
  }
  return { roundId: value.roundId, answers: map('answers'), errorReasons: map('errorReasons'), notes: map('notes') }
}
