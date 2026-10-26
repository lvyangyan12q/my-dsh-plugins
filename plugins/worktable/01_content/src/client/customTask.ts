import { widgetTargets, type WidgetSpec, type WidgetBinding } from './widgetMount'
import { isAbs, joinPath } from './pathutil'
import { createHostSession } from './sessionDetails'

export type CustomSource = { projectId: string; paneId: string; tabId: string }
type Request = { projectId: string; folder: string | null; window: string; source?: CustomSource; sessionId?: string; submission?: object; intent?: string }
export type CustomTarget = CustomSource & { folder: string | null; window: string; content: string }
type Dependencies = {
  getProject: (id: string) => { folder?: string | null; spec?: WidgetSpec }
  storageAvailable: () => boolean
  checkFolder?: (folder: string) => Promise<void>
  create: (validate: () => void) => Promise<string>
  configure: (sessionId: string, validate: () => void) => Promise<void>
  open: (sessionId: string) => Promise<void>
  bind: (target: CustomTarget, sessionId: string) => WidgetBinding[]
  send: (sessionId: string, prepare: () => WidgetBinding[]) => Promise<void>
}

const submissions = new WeakMap<object, Map<string, Promise<string>>>()
const inFlight = new Map<string, {intent: string; promise: Promise<string>}>()

/** A mounted custom form owns its submission token; it can be collected with the form. */
export async function submitCustomTask(request: Request, deps: Dependencies): Promise<string> {
  const scope = JSON.stringify([request.projectId,request.source?.paneId ?? request.window])
  const intent = JSON.stringify([request.projectId,request.window,request.folder,request.sessionId,request.source,request.intent])
  const token = request.submission ?? request
  const previous = submissions.get(token)?.get(intent)
  if (previous) return previous
  const pending = inFlight.get(scope)
  if (pending) {
    if (pending.intent !== intent) throw new Error('该窗口正在提交，请等待完成后再修改要求。')
    const history = submissions.get(token) ?? new Map<string,Promise<string>>()
    history.set(intent,pending.promise)
    submissions.set(token,history)
    try { return await pending.promise } catch (error) { history.delete(intent); throw error }
  }
  const promise = Promise.resolve().then(() => performCustomTask(request,deps))
  const history = submissions.get(token) ?? new Map<string,Promise<string>>()
  history.set(intent,promise)
  submissions.set(token,history)
  inFlight.set(scope,{intent,promise})
  try { return await promise }
  catch (error) { history.delete(intent); throw error }
  finally { if (inFlight.get(scope)?.promise === promise) inFlight.delete(scope) }
}

/** The same public submission path is used by new and existing custom sessions. */
async function performCustomTask(request: Request, deps: Dependencies): Promise<string> {
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
    if (!sessionId) { sessionId = await deps.create(revalidate); created = true; revalidate(); await deps.configure(sessionId,revalidate) }
    revalidate()
    await deps.open(sessionId)
    revalidate()
    await deps.send(sessionId,() => { revalidate(); return deps.bind(target,sessionId!) })
    return sessionId
  } catch (cause) {
    const message = cause instanceof Error && /[\u3400-\u9fff]/.test(cause.message) ? cause.message : '提交失败，请检查会话与项目存储后重试。'
    throw new Error(message + (created ? ` 会话已创建（${sessionId}），尚未确认发送；未删除或移动该会话。` : ''), {cause})
  }
}

export type CustomSessionGroup = {kind:'none'} | {kind:'existing';workspaceId:string} | {kind:'new';parent:string;name:string}

/** Group and session creation share the same target lease across every awaited boundary. */
export async function createCustomHostSession(host: {sessions:any;workspaces:any;mkdir:(path:string)=>Promise<void>}, group: CustomSessionGroup, folder: string | null, validate: () => void): Promise<string> {
  validate()
  let workspaceId: string | null = null
  if (group.kind === 'existing') {
    if (!group.workspaceId) throw new Error('请选择现有分组。')
    workspaceId = group.workspaceId
  } else if (group.kind === 'new') {
    const ws = host.workspaces
    if (typeof ws?.create !== 'function') throw new Error('分组服务不可用。')
    const parent = group.parent.replace(/[\\/]+$/, '')
    const name = group.name.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')
    if (!parent || !isAbs(group.parent) || !name) throw new Error('请选择有效的分组父目录和名称。')
    const full = joinPath(group.parent,name)
    try { await ws.createDirectory?.(parent,name) } catch { /* The native directory service may be unavailable; authenticated mkdir is the fallback. */ }
    validate()
    await host.mkdir(full)
    validate()
    const view = await ws.create({path:full})
    validate()
    workspaceId = view?.workspaceId ?? view?.id ?? null
    if (!workspaceId) throw new Error('分组创建失败，请检查宿主状态。')
  }
  validate()
  const options = workspaceId ? {workspaceId} : folder ? {cwd:folder} : {}
  return createHostSession(host.sessions,host.workspaces,options,group.kind === 'none' ? 'none' : 'auto')
}
