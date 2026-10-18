import type { ReadingInstance } from './reading-api.ts'
export type DataConnection = { id: string; ownerInstanceId: string; consumerInstanceId: string; revision: number; allowedActions: string[]; status: string }
export type ReadingData = ReadingInstance & { connection?: DataConnection | null; ownerInstanceId?: string }
const listeners = new Set<{ instanceId: string; notify: () => void }>()
export function notifyReading() { for (const listener of listeners) listener.notify() }
export function subscribeReading(scope: { instanceId: string; preview: boolean }, notify: () => void) { const row = { instanceId: scope.instanceId, notify }; listeners.add(row); return () => { listeners.delete(row) } }
export async function resourceRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch('/api/worktable/resources', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '资料服务不可用')
  return data
}
export async function requestReading(body: { action: string; instanceId: string; preview?: boolean; viewId?: string; [key: string]: unknown }, signal?: AbortSignal): Promise<ReadingData> {
  if (!body.viewId || body.preview) throw new Error('请从工作台已登记阅读视图访问资料；旧任意实例ID入口已关闭。')
  const { action, instanceId, viewId, preview: _preview, expectedRevision, expectedConnectionRevision, ...payload } = body
  const data = await resourceRequest({ operation: 'call', viewId, resourceId: 'reading-records', action, payload, expectedRevision, expectedConnectionRevision }, signal)
  if (data.committed && !data.value) { notifyReading(); throw new Error(data.notice ?? '写入已提交，当前资料权限已改变，请刷新。') }
  if (!data.value || !Array.isArray(data.value.records) || typeof data.value.instanceId !== 'string') throw new Error('阅读响应无效')
  if (data.connection ? (data.connection.consumerInstanceId !== instanceId || data.connection.ownerInstanceId !== data.value.instanceId || data.connection.status !== 'active') : data.value.instanceId !== instanceId) throw new Error('阅读响应实例或引用归属不匹配')
  if (action !== 'read') notifyReading()
  return { ...data.value, ownerInstanceId: data.value.instanceId, instanceId, connection: data.connection }
}
export const recordOrigin = (id: string) => ['walden','origin','pride'].includes(id) ? '示例记录' : '自录记录'
