import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClassroomCommand, ClassroomSpaceView, ClassroomView } from './contract.ts'
import { createClassroomClient, type ClassroomClient } from './classroom-client.ts'
import { CanvasZone, type CanvasOpenTarget } from './canvas-zone.tsx'
import { LectureZone, type LectureOpenRequest } from './lecture-zone.tsx'
import { NotesZone, type NoteOpenRequest } from './notes-zone.tsx'

export const panelId = 'learning-classroom'
export const panelLabel = '学习课堂'

export interface ClassroomPanelProps {
  client?: ClassroomClient
}

const styles = `
.lc-root{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;padding:16px;color:var(--dsh-text-primary,#1f2328)}
.lc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.lc-head h1{margin:0;font-size:20px}
.lc-head p{margin:4px 0 0;color:var(--dsh-text-secondary,#59636e);font-size:13px}
.lc-form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;padding:12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px}
.lc-form label{display:flex;flex-direction:column;gap:4px;font-size:13px}
.lc-form input{min-width:280px;padding:6px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit}
.lc-form button,.lc-secondary{padding:6px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-form button[type="submit"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-form button:disabled{opacity:.5;cursor:default}
.lc-hint{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-alert{padding:10px 12px;border:1px solid #d1242f;border-radius:8px;background:#ffebe9;color:#82071e}
.lc-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
.lc-grid{display:grid;grid-template-columns:200px minmax(280px,2fr) minmax(220px,1fr) minmax(240px,1fr);gap:8px;min-height:0;flex:1}
.lc-main{display:flex;flex-direction:column;flex:1;min-height:0}
.lc-main[hidden]{display:none}
.lc-view-tabs{display:flex;gap:6px}
.lc-view-tab{padding:5px 14px;border:1px solid var(--dsh-border,#d8dee4);border-radius:999px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-view-tab[aria-selected="true"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-pane{display:flex;flex-direction:column;gap:8px;min-width:0;overflow:auto;padding:12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff)}
.lc-pane h2{margin:0;font-size:14px}
.lc-pane p{margin:0;font-size:13px;line-height:1.6}
.lc-directory ul{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.lc-directory button{width:100%;padding:6px 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.lc-directory button[aria-current="true"]{border-color:var(--dsh-accent,#0969da);background:#ddf4ff}
.lc-conversation{background:#f6f8fa}
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
}) {
  const { client, view, space, busy, onOpen, openLecture, openNote } = props
  return (
    <div className="lc-grid">
      <LectureZone
        client={client}
        space={space}
        spaces={view.spaces}
        currentSpaceId={view.currentSpaceId}
        busy={busy}
        onOpenSpace={onOpen}
        openRequest={openLecture}
      />
      <section className="lc-pane lc-notes" aria-label="我的笔记">
        <h2>我的笔记</h2>
        <NotesZone client={client} space={space} openRequest={openNote} />
      </section>
      <section className="lc-pane lc-conversation" aria-label="老师对话">
        <h2>老师对话</h2>
        <p role="note">老师对话尚未连接。这里不会显示伪造的聊天回复；连接真实会话后会在这个区域显示。</p>
      </section>
    </div>
  )
}

/** Main panel: vault onboarding, space creation and the four-region shell. */
export function ClassroomPanel({ client }: ClassroomPanelProps) {
  const api = useMemo(() => client ?? createClassroomClient(), [client])
  const [view, setView] = useState<ClassroomView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [vaultInput, setVaultInput] = useState('')
  const [spaceTitle, setSpaceTitle] = useState('')
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

  const run = async (command: ClassroomCommand) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await api.command(command)
      if (!alive.current) return
      setView(next)
      setSpaceTitle('')
      setVaultInput('')
      setShowVaultForm(false)
      // Space/vault navigation always returns to the classroom; stale canvas
      // targets from the previous space must not leak into the new one.
      setMode('classroom')
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
          <form className="lc-form" aria-label="创建学习空间" onSubmit={event => { event.preventDefault(); if (spaceTitle.trim()) void run({ action: 'space-create', title: spaceTitle.trim() }) }}>
            <label>
              学习空间名称
              <input aria-label="学习空间名称" value={spaceTitle} disabled={busy} maxLength={120} onChange={event => setSpaceTitle(event.target.value)} placeholder="例如：线性代数" />
            </label>
            <button type="submit" disabled={busy || spaceTitle.trim() === ''}>创建学习空间</button>
            <p className="lc-hint">会在知识文件库根目录下建立一个同名文件夹，包含讲义、笔记和附件。</p>
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
                <div className="lc-main" hidden={mode !== 'classroom'}>
                  <ClassroomGrid
                    client={api}
                    view={view}
                    space={space}
                    busy={busy}
                    onOpen={spaceId => void run({ action: 'space-open', spaceId })}
                    openLecture={openLecture}
                    openNote={openNote}
                  />
                </div>
                {canvasMounted && (
                  <div className="lc-main" hidden={mode !== 'canvas'}>
                    <CanvasZone
                      client={api}
                      space={space}
                      vaultPath={view.vault.path}
                      busy={busy}
                      onOpenTarget={openCanvasTarget}
                    />
                  </div>
                )}
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
  slots: {
    inject(name: string, install: () => unknown): unknown
    register(spec: Record<string, unknown>, component: unknown): unknown
  }
  effect(install: () => unknown): unknown
}

/** Public sidebar entry and main panel registration, same id for both. */
export function apply(ctx: SlotsContext) {
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId }, ClassroomPanel)))
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: panelId,
    order: 30,
    label: () => panelLabel,
  }, () => <span aria-hidden="true">学</span>)))
}
