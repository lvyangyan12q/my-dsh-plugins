import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ClassroomSpaceView, ClassroomView, ClassroomViewCommand } from './contract.ts'
import { createClassroomClient, type ClassroomClient } from './classroom-client.ts'
import { CanvasZone, type CanvasOpenTarget } from './canvas-zone.tsx'
import { ClassroomLayoutView, type ClassroomMainView } from './classroom-layout.tsx'
import { normalizeLayout, type ClassroomLayout } from './layout.ts'
import { LectureZone, type LectureOpenRequest } from './lecture-zone.tsx'
import { NotesZone, type NoteOpenRequest } from './notes-zone.tsx'
import {
  teacherSessionSeat,
  TeacherConversationSeat,
  TeacherSessionZone,
  type RenderSlotLike,
  type SessionProviderLike,
  type SessionsLike,
} from './session-zone.tsx'

export const panelId = 'learning-classroom'
export const panelLabel = '学习课堂'

export interface ClassroomPanelProps {
  client?: ClassroomClient
  /** Framework-injected public Session service (`ctx.sessions`). */
  sessions?: SessionsLike
  /** Framework-injected child-slot renderer for the main entry that declares the session seat. */
  renderSlot?: RenderSlotLike
  /** Framework-injected Session area component for the declared session seat. */
  SessionProvider?: SessionProviderLike
}

const styles = `
.lc-root{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;max-width:100%;min-width:0;padding:16px;color:var(--dsh-text-primary,#1f2328)}
.lc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;min-width:0}
.lc-head h1{margin:0;font-size:20px}
.lc-head p{margin:4px 0 0;color:var(--dsh-text-secondary,#59636e);font-size:13px;overflow-wrap:anywhere}
.lc-form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;min-width:0;padding:8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px}
.lc-form label{display:flex;flex-direction:column;gap:4px;flex:1 1 240px;min-width:0;font-size:13px}
.lc-form input{box-sizing:border-box;display:block;flex:none;width:100%;height:32px;min-height:32px;max-width:100%;min-width:0;padding:4px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font:inherit}
.lc-form .lc-hint{flex:1 1 100%}
.lc-form button,.lc-secondary{padding:6px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-form button[type="submit"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-form button:disabled{opacity:.5;cursor:default}
.lc-hint{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-alert{padding:10px 12px;border:1px solid #d1242f;border-radius:8px;background:#ffebe9;color:#82071e}
.lc-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
.lc-main{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-view-tabs{display:flex;flex-wrap:wrap;gap:6px}
.lc-view-tab{padding:5px 14px;border:1px solid var(--dsh-border,#d8dee4);border-radius:999px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-view-tab[aria-selected="true"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-pane{display:flex;flex-direction:column;gap:8px;min-width:0;overflow:auto;padding:12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff)}
.lc-pane h2{margin:0;font-size:14px}
.lc-pane p{margin:0;font-size:13px;line-height:1.6}
.lc-directory ul{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.lc-directory button{width:100%;padding:6px 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.lc-directory button[aria-current="true"]{border-color:var(--dsh-accent,#0969da);background:#ddf4ff}
.lc-conversation,.lc-zone-conversation{background:#f6f8fa;overflow:hidden}
.lc-conversation>h2,.lc-zone-conversation>h2{flex:none}
.lc-session-zone{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;min-width:0}
.lc-session-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.lc-session-empty p{margin:0}
.lc-session-body{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff)}
.lc-session-body [data-slot="learningClassroom.teacherSession"]{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-teacher-session{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-session-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid #d1242f;border-radius:8px;background:#ffebe9;color:#82071e}
.lc-session-error p{margin:0}
.lc-note-file{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '学习课堂操作失败。'
}

function VaultForm(props: { busy: boolean; value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  return (
    <form className="lc-form" aria-label="选择知识文件库" onSubmit={event => { event.preventDefault(); props.onSubmit() }}>
      <label>
        知识文件库目录
        <input
          aria-label="知识文件库路径"
          placeholder="D:\\学习\\知识文件库"
          value={props.value}
          disabled={props.busy}
          onChange={event => props.onChange(event.target.value)}
        />
      </label>
      <button type="submit" disabled={props.busy || props.value.trim() === ''}>选择此目录</button>
      <p className="lc-hint">必须是已存在的本地目录。讲义、笔记和附件都会保存在这个目录里，Obsidian 可直接打开。</p>
    </form>
  )
}

function ClassroomGrid(props: {
  client: ClassroomClient
  view: ClassroomView
  space: ClassroomSpaceView
  busy: boolean
  onOpen: (spaceId: string) => void
  openLecture: LectureOpenRequest | null
  openNote: NoteOpenRequest | null
  sessions?: SessionsLike
  renderSlot?: RenderSlotLike
  SessionProvider?: SessionProviderLike
  /** Main-column content: lecture/classroom or the knowledge canvas. */
  mainView: ClassroomMainView
  /** Mounted canvas; kept mounted while the classroom owns the main column. */
  canvas?: ReactNode
  onView: (view: ClassroomView) => void
  onLayoutChange: (spaceId: string, layout: ClassroomLayout) => void
}) {
  const { client, view, space, busy, onOpen, openLecture, openNote, sessions, renderSlot, SessionProvider, mainView, canvas, onView, onLayoutChange } = props
  return (
    <ClassroomLayoutView
      layout={normalizeLayout(space.layout)}
      onLayoutChange={next => onLayoutChange(space.id, next)}
      mainView={mainView}
      main={canvas}
      lecture={(
        <LectureZone
          client={client}
          space={space}
          spaces={view.spaces}
          currentSpaceId={view.currentSpaceId}
          busy={busy}
          onOpenSpace={onOpen}
          openRequest={openLecture}
        />
      )}
      notes={<NotesZone client={client} space={space} openRequest={openNote} />}
      conversation={(
        <TeacherSessionZone
          key={space.id}
          space={space}
          client={client}
          sessions={sessions}
          renderSlot={renderSlot}
          SessionProvider={SessionProvider}
          onView={onView}
        />
      )}
    />
  )
}

/** Main panel: vault onboarding, space creation and the four-region shell. */
export function ClassroomPanel({ client, sessions, renderSlot, SessionProvider }: ClassroomPanelProps) {
  const api = useMemo(() => client ?? createClassroomClient(), [client])
  const [view, setView] = useState<ClassroomView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [vaultInput, setVaultInput] = useState('')
  const [spaceTitle, setSpaceTitle] = useState('')
  const [spaceGoal, setSpaceGoal] = useState('')
  const [showVaultForm, setShowVaultForm] = useState(false)
  const [mode, setMode] = useState<'classroom' | 'canvas'>('classroom')
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [openLecture, setOpenLecture] = useState<LectureOpenRequest | null>(null)
  const [openNote, setOpenNote] = useState<NoteOpenRequest | null>(null)
  const requestToken = useRef(0)
  const noteToken = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    setLoadError('')
    api.load(controller.signal).then(next => {
      if (!controller.signal.aborted && alive.current) setView(next)
    }).catch(cause => {
      if (!controller.signal.aborted && alive.current) {
        setView(null)
        setLoadError(messageOf(cause))
      }
    })
    return () => { alive.current = false; controller.abort() }
  }, [api, reloadKey])

  const run = async (command: ClassroomViewCommand) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await api.command(command)
      if (!alive.current) return
      setView(next)
      setSpaceTitle('')
      setSpaceGoal('')
      setVaultInput('')
      setShowVaultForm(false)
      // Space/vault navigation always returns to the classroom; stale canvas
      // targets and a canvas from the previous space must not leak into the new one.
      setMode('classroom')
      setCanvasMounted(false)
      setOpenLecture(null)
      setOpenNote(null)
    } catch (cause) {
      if (alive.current) setError(messageOf(cause))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  /** Canvas file nodes hand their target to the classroom's existing zones. */
  const openCanvasTarget = (target: CanvasOpenTarget) => {
    setError('')
    if (target.kind === 'note') {
      noteToken.current += 1
      setOpenNote({ path: target.path, token: noteToken.current })
      setMode('classroom')
      return
    }
    requestToken.current += 1
    setOpenLecture({ path: target.path, token: requestToken.current })
    setMode('classroom')
  }

  /**
   * Layout is navigation state: apply it locally, then write it for the current
   * space. A failed write keeps the on-screen layout and explains itself; no
   * lecture, note or session request is involved.
   */
  const persistLayout = (spaceId: string, layout: ClassroomLayout) => {
    setView(current => current === null ? current : {
      ...current,
      spaces: current.spaces.map(row => (row.id === spaceId ? { ...row, layout } : row)),
    })
    api.saveLayout({ action: 'layout-save', spaceId, layout }).catch(cause => {
      if (alive.current) setError(`布局未能保存：${messageOf(cause)}`)
    })
  }

  const space = view?.spaces.find(row => row.id === view.currentSpaceId)
  const vaultStatus = view?.vault.status ?? 'unset'

  return (
    <section className="lc-root" aria-label="学习课堂">
      <style>{styles}</style>
      <header className="lc-head">
        <div>
          <h1>学习课堂</h1>
          <p>{view?.vault.path ? `知识文件库：${view.vault.path}` : '把讲义、笔记和对话放在同一个学习空间里。'}</p>
        </div>
        {vaultStatus === 'ready' && !showVaultForm && (
          <button className="lc-secondary" disabled={busy} onClick={() => { setShowVaultForm(true); setVaultInput(view?.vault.path ?? '') }}>更换知识文件库</button>
        )}
      </header>

      {loadError !== '' && (
        <div className="lc-alert" role="alert">
          <p>无法读取学习课堂状态：{loadError}</p>
          <button className="lc-secondary" onClick={() => setReloadKey(key => key + 1)}>重试</button>
        </div>
      )}

      {view === null && loadError === '' && <p role="status">正在读取学习课堂…</p>}

      {error !== '' && <div className="lc-alert" role="alert">{error}</div>}

      {view !== null && vaultStatus === 'unset' && (
        <>
          <div className="lc-empty">
            <h2>选择知识文件库</h2>
            <p>先选一个已存在的本地目录作为知识文件库。它是所有学习空间的根目录，内容始终是普通文件。</p>
          </div>
          <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
        </>
      )}

      {view !== null && vaultStatus === 'unavailable' && (
        <>
          <div className="lc-alert" role="status">
            <p>{view.vault.reason ?? '知识文件库不可访问。'}</p>
            <p>{view.vault.hint}</p>
          </div>
          <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
        </>
      )}

      {view !== null && vaultStatus === 'ready' && showVaultForm && (
        <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
      )}

      {view !== null && vaultStatus === 'ready' && !showVaultForm && (
        <>
          <form className="lc-form" aria-label="创建学习空间" onSubmit={event => {
            event.preventDefault()
            const title = spaceTitle.trim()
            if (!title) return
            const goal = spaceGoal.trim()
            void run(goal === '' ? { action: 'space-create', title } : { action: 'space-create', title, goal })
          }}>
            <label>
              学习空间名称
              <input aria-label="学习空间名称" value={spaceTitle} disabled={busy} maxLength={120} onChange={event => setSpaceTitle(event.target.value)} placeholder="例如：线性代数" />
            </label>
            <label>
              学习目标（可选）
              <input aria-label="学习目标（可选）" value={spaceGoal} disabled={busy} maxLength={2000} onChange={event => setSpaceGoal(event.target.value)} placeholder="例如：能独立完成条件概率题" />
            </label>
            <button type="submit" disabled={busy || spaceTitle.trim() === ''}>创建学习空间</button>
            <p className="lc-hint">会在知识文件库根目录下建立一个同名文件夹，包含讲义、笔记、附件和学习目标文件。</p>
          </form>

          {space !== undefined
            ? (
              <>
                <div className="lc-view-tabs" role="tablist" aria-label="主内容视图">
                  <button
                    type="button"
                    role="tab"
                    className="lc-view-tab"
                    aria-selected={mode === 'classroom'}
                    disabled={busy}
                    onClick={() => setMode('classroom')}
                  >课堂</button>
                  <button
                    type="button"
                    role="tab"
                    className="lc-view-tab"
                    aria-selected={mode === 'canvas'}
                    disabled={busy}
                    onClick={() => { setCanvasMounted(true); setMode('canvas') }}
                  >脉络</button>
                </div>
                <div className="lc-main">
                  <ClassroomGrid
                    client={api}
                    view={view}
                    space={space}
                    busy={busy}
                    onOpen={spaceId => void run({ action: 'space-open', spaceId })}
                    openLecture={openLecture}
                    openNote={openNote}
                    sessions={sessions}
                    renderSlot={renderSlot}
                    SessionProvider={SessionProvider}
                    mainView={mode === 'canvas' ? 'canvas' : 'lecture'}
                    canvas={canvasMounted
                      ? (
                        <CanvasZone
                          client={api}
                          space={space}
                          vaultPath={view.vault.path}
                          busy={busy}
                          onOpenTarget={openCanvasTarget}
                        />
                      )
                      : undefined}
                    onView={setView}
                    onLayoutChange={persistLayout}
                  />
                </div>
              </>
            )
            : (
              <div className="lc-empty">
                <h2>{view.spaces.length === 0 ? '还没有学习空间' : '选择一个学习空间'}</h2>
                <p>{view.spaces.length === 0 ? '创建一个学习空间开始。文件夹会出现在知识文件库根目录下。' : '从上方输入框创建，或在课程目录里选择已有空间。'}</p>
                {view.spaces.length > 0 && (
                  <ul>
                    {view.spaces.map(row => <li key={row.id}><button className="lc-secondary" disabled={busy} onClick={() => void run({ action: 'space-open', spaceId: row.id })}>{row.title}</button></li>)}
                  </ul>
                )}
              </div>
            )}
        </>
      )}
    </section>
  )
}

interface SlotsContext {
  /** Public Session Controller face; the classroom owns and releases its own references. */
  sessions: SessionsLike
  slots: {
    inject(name: string, install: () => unknown): unknown
    register(spec: Record<string, unknown>, component: unknown): unknown
  }
  effect(install: () => unknown): unknown
}

/** Waits for the client services this entry composes with. */
export const inject = ['slots', 'sessions']

/**
 * Public sidebar entry and main panel registration, same id for both.
 *
 * The main entry declares one Session child seat of this plugin's own name:
 * that is what makes the framework inject `SessionProvider` into the panel.
 * The seat entry then renders the native `conversation.content` Factory inside
 * that explicit Session binding. Neither registration imports a private Chat
 * component or opens the native Conversation page.
 */
export function apply(ctx: SlotsContext) {
  const sessions = ctx.sessions
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: panelId,
    inject: () => ({ sessions }),
    children: { [teacherSessionSeat]: { kind: 'single', scope: 'session' } },
  }, ClassroomPanel)))
  ctx.effect(() => ctx.slots.inject(teacherSessionSeat, () => ctx.slots.register(
    { name: teacherSessionSeat },
    TeacherConversationSeat,
  )))
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: panelId,
    order: 30,
    label: () => panelLabel,
  }, () => <span aria-hidden="true">学</span>)))
}
