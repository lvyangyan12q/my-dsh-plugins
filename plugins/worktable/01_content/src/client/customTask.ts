import { widgetTargets, type WidgetSpec, type WidgetBinding } from './widgetMount'
import { isAbs } from './pathutil'

export type CustomSource = { projectId: string; paneId: string; tabId: string }
type Request = { projectId: string; folder: string | null; window: string; source?: CustomSource; sessionId?: string }
export type CustomTarget = CustomSource & { folder: string | null; window: string; content: string }
type Dependencies = {
  getProject: (id: string) => { folder?: string | null; spec?: WidgetSpec }
  storageAvailable: () => boolean
  checkFolder?: (folder: string) => Promise<void>
  create: () => Promise<string>
  configure: (sessionId: string) => Promise<void>
  open: (sessionId: string) => Promise<void>
  bind: (target: CustomTarget, sessionId: string) => WidgetBinding[]
  send: (sessionId: string, bindings: WidgetBinding[]) => Promise<void>
}

/** The same public submission path is used by new and existing custom sessions. */
export async function submitCustomTask(request: Request, deps: Dependencies): Promise<string> {
  const capture = (): CustomTarget => {
    const current = deps.getProject(request.projectId)
    if (!current.spec || current.spec.id !== request.projectId) throw new Error('项目或窗口已经变化，请重新打开目标窗口。')
    if ((current.folder || null) !== request.folder) throw new Error('项目目录已经变化，请重新打开目标窗口。')
    if (request.folder && !isAbs(request.folder)) throw new Error('项目目录不可用，请选择有效的绝对路径。')
    if (request.folder && !deps.storageAvailable()) throw new Error('项目存储不可用，请恢复浏览器存储后重试。')
    const targets = widgetTargets(current.spec)
    const selected = targets.find(t => t.window === request.window)
    if (!selected || new Set(targets.map(t => t.pane.id)).size !== targets.length) throw new Error('目标窗口已经变化，请重新打开目标窗口。')
    const pane = selected.pane
    const tab = pane.tabs?.[pane.active ?? 0]
    const source = request.source
    if (source && (source.projectId !== request.projectId || source.paneId !== pane.id || source.tabId !== tab?.id)) throw new Error('目标窗口或标签已经变化，请重新打开目标窗口。')
    return {projectId:request.projectId,paneId:pane.id,tabId:tab?.id ?? '',folder:request.folder,window:selected.window,content:JSON.stringify(tab?.content ?? pane.content ?? null)}
  }
  const target = capture()
  const revalidate = () => {
    const current = capture()
    if (current.paneId !== target.paneId || current.tabId !== target.tabId || current.content !== target.content) throw new Error('目标窗口或标签已经变化，请重新打开目标窗口。')
  }
  let sessionId = request.sessionId
  let created = false
  try {
    if (request.folder && deps.checkFolder) { await deps.checkFolder(request.folder); revalidate() }
    if (!sessionId) { sessionId = await deps.create(); created = true; revalidate(); await deps.configure(sessionId) }
    revalidate()
    await deps.open(sessionId)
    revalidate()
    const bindings = deps.bind(target,sessionId)
    await deps.send(sessionId,bindings)
    return sessionId
  } catch (cause) {
    const message = cause instanceof Error && /[\u3400-\u9fff]/.test(cause.message) ? cause.message : '提交失败，请检查会话与项目存储后重试。'
    throw new Error(message + (created ? ` 会话已创建（${sessionId}），尚未确认发送；未删除或移动该会话。` : ''), {cause})
  }
}
