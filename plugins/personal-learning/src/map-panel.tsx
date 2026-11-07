import React, { useEffect, useState } from 'react'
import { PersonalMap } from './personal-map.tsx'
import { KnowledgeExplorer } from './knowledge-map.mjs'
import { RequestPanel } from './request-panel.tsx'
import { RecoveryPanel } from './recovery-panel.tsx'

const mapStyles = `.pl-map{display:block}
.pl-map-head{display:flex;justify-content:space-between;align-items:flex-end;margin:0 0 18px}
.pl-map-head small{display:block;color:#a2a29a;font-size:11.5px;letter-spacing:.14em}
.pl-map-head b{font-size:24px;letter-spacing:-.01em;line-height:1.3}
.pl-map .pl-more{background:#fff;color:#6f6f68;border:1px solid #e6e6e2;border-radius:8px;padding:6px 12px;font-size:14px;line-height:1.4;cursor:pointer}
.pl-map-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}
.pl-map-canvas{border:1px solid #e6e6e2;border-radius:12px;padding:18px 20px;background:#fbfbf9;min-height:420px}
.pl-map-canvas article h2{font-size:15px;margin:0 0 10px}
.pl-map-canvas nav{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.pl-map-canvas nav button{border-radius:999px}
.pl-map-canvas nav button[aria-pressed=true]{background:#eaf3ed;border-color:#cfe3d8;color:#0f6b3f;font-weight:600}
.pl-map-canvas ul{list-style:none;margin:10px 0;padding:0;display:grid;gap:6px;font-size:12.5px;color:#6f6f68}
.pl-map-canvas ul li{background:#fff;border:1px solid #e6e6e2;border-radius:8px;padding:7px 10px}
.pl-map-canvas details{margin-top:14px}
.pl-map-side{border:1px solid #e6e6e2;border-radius:12px;padding:16px 18px;background:#fff}
.pl-map-side h3{margin:0 0 6px;font-size:12px;color:#8a8a84;letter-spacing:.08em}
.pl-map-side p{margin:0 0 12px;font-size:13px;line-height:1.8;color:#3b3b36}
.pl-map .pl-side-primary{width:100%;background:#0f6b3f;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:600;font-size:13px;cursor:pointer}
.pl-map .pl-side-note{font-size:11.5px;color:#a2a29a;line-height:1.7;margin:10px 0 0}
.pl-map .pl-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:100vw;background:#fff;border-left:1px solid #e6e6e2;box-shadow:-16px 0 40px rgba(0,0,0,.08);z-index:20;display:flex;flex-direction:column}
.pl-map .pl-drawer-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee}
.pl-map .pl-drawer-body{overflow:auto;padding:8px 18px 30px}
.pl-map .pl-drawer section{border-bottom:1px solid #f1f1ed;padding:14px 0}
.pl-map .pl-drawer h4{margin:0 0 8px;font-size:12px;color:#8a8a84;letter-spacing:.08em}
@media(max-width:1000px){.pl-map-body{grid-template-columns:minmax(0,1fr)}}`

export function MapPanel ({ instanceId, instanceTitle, goal, request, openSession, openCourse }) {
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!drawer) return
    const listener = event => { if (event.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [drawer])

  async function openTeaching () {
    try {
      const workspaces = await request({ action: 'teaching-workspaces' })
      if (!workspaces.length) throw Error('先在 DSH 里登记一个工作目录')
      const binding = await request({ action: 'teaching-open', instanceId, workspaceId: workspaces[0].id })
      openSession(binding.sessionId)
    } catch (reason) { setError(reason.message) }
  }

  return (
    <section className="pl-map" aria-label="知识地图视图"><style>{mapStyles}</style>
      <header className="pl-map-head">
        <div><small>知识地图 / 系统探索</small><b>{instanceTitle}</b></div>
        <button type="button" className="pl-more" onClick={() => setDrawer(true)}>⋯</button>
      </header>
      <div className="pl-map-body">
        <div className="pl-map-canvas">
          <PersonalMap instanceId={instanceId} request={request} openSession={openSession} openCourse={openCourse} />
          <details><summary>查看示例知识地图与样课</summary><KnowledgeExplorer key={instanceId} /></details>
        </div>
        <aside className="pl-map-side">
          <h3>这一程的目标</h3>
          <p>{goal || '还没有写学习目标'}</p>
          <button type="button" className="pl-side-primary" onClick={openTeaching}>打开或继续教学</button>
          <p className="pl-side-note">地图、课程与追问都在同一个原生教学会话里；生成与恢复收在「⋯」。</p>
          {error && <p role="alert" style={{ color: '#a2462a' }}>{error}</p>}
        </aside>
      </div>
      {drawer && (
        <div className="pl-drawer" role="dialog" aria-modal="true" aria-label="更多">
          <div className="pl-drawer-head"><b>更多</b><button type="button" onClick={() => setDrawer(false)}>关闭</button></div>
          <div className="pl-drawer-body">
            <section>
              <h4>教学请求</h4>
              <RequestPanel instanceId={instanceId} request={request} openSession={openSession} />
            </section>
            <section>
              <h4>恢复与历史</h4>
              <RecoveryPanel instanceId={instanceId} request={request} openSession={openSession} />
            </section>
          </div>
        </div>
      )}
    </section>
  )
}
