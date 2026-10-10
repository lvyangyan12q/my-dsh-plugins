import type { ReadingInstance } from './reading-api.ts'
const listeners = new Set<{ instanceId: string; notify: () => void }>()
export function subscribeReading(scope: { instanceId: string; preview: boolean }, notify: () => void) { const row = { instanceId: scope.preview ? 'default' : scope.instanceId, notify }; listeners.add(row); return () => { listeners.delete(row) } }
export async function requestReading(body: { action: string; instanceId: string; preview?: boolean; [key: string]: unknown }, signal?: AbortSignal): Promise<ReadingInstance> {
  const response = await fetch('/api/reading-statistics/data', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const data = await response.json()
  if (!response.ok || data.version !== 1 || !data.instance || !Array.isArray(data.instance.records)) throw new Error(data.error ?? 'Reading data unavailable')
  if (body.action !== 'read') for (const listener of listeners) if (listener.instanceId === body.instanceId) listener.notify()
  return data.instance
}
export const recordOrigin = (id: string) => ['walden','origin','pride'].includes(id) ? '示例记录' : '自录记录'