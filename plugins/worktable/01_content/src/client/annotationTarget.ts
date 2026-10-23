type Pane = { id: string; active?: number; tabs?: { id: string; content: any }[]; content?: any }
type Layout = { id: string; left?: Pane | null; top?: Pane[] | null; main?: Pane[] }
export type AnnotationTarget = { projectId: string; paneId: string; tabId: string | null; content: Record<string, string | null> }
function identity(content: any): Record<string, string | null> {
  if (!content) return { kind: null }
  if (content.kind === 'application') return { kind: content.kind, appId: content.appId, instanceId: content.instanceId, viewId: content.viewId }
  const result: Record<string, string | null> = { kind: content.kind }
  for (const key of ['type', 'url', 'path', 'id']) if (typeof content[key] === 'string') result[key] = content[key]
  return result
}
function panes(spec: Layout): Pane[] { return [...(spec.left ? [spec.left] : []), ...(spec.top ?? []), ...(spec.main ?? [])] }
export function captureAnnotationTarget(spec: Layout | null, row: 'left' | 'top' | 'main', index: number): AnnotationTarget {
  const pane = row === 'left' ? spec?.left : spec?.[row]?.[index]
  if (!spec || !pane) throw new Error('标注目标已不可用，请重新选择模块。')
  const tab = pane.tabs?.[pane.active ?? 0]
  return { projectId: spec.id, paneId: pane.id, tabId: tab?.id ?? null, content: identity(tab?.content ?? pane.content) }
}
export function resolveAnnotationTarget(target: AnnotationTarget, spec: Layout | null): { target: AnnotationTarget; paneId: string } {
  if (!spec || spec.id !== target.projectId) throw new Error('标注所属项目已切换；要求草稿已保留，请返回原项目后重试。')
  const candidates = panes(spec).flatMap(pane => target.tabId ? (pane.tabs ?? []).filter(tab => tab.id === target.tabId).map(tab => ({ pane, content: tab.content })) : pane.id === target.paneId ? [{ pane, content: pane.content ?? pane.tabs?.[pane.active ?? 0]?.content }] : [])
  if (candidates.length !== 1) throw new Error('标注目标已移除或身份重复；要求草稿已保留，请重新选择模块。')
  const found = candidates[0]
  if (JSON.stringify(identity(found.content)) !== JSON.stringify(target.content)) throw new Error('标注目标内容已替换；要求草稿已保留，请重新选择模块。')
  return { target, paneId: found.pane.id }
}
