import React, { useEffect, useState } from 'react'
import { RefreshCw, Plus, Save, Settings, Trash2, MessageSquare } from 'lucide-react'
import type { ManagementCatalog, ManagementRequest } from './management-api.ts'
import type { WorkbenchAppDefinition } from './workbench-api.ts'
import type { en } from './locale.ts'
import { independentManagementStyles } from './independent-management-styles.ts'

export interface ManagementCommands { openBundle?: (name: string) => void; openSession?: (id: string) => void }
export async function managementCall(request: ManagementRequest, signal?: AbortSignal) {
  const response = await fetch('/api/personal-workbench/management', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal })
  let body
  try { body = await response.json() } catch { throw new Error('管理服务返回格式错误') }
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : '管理服务不可用')
  return body
}
interface Draft { id: string; name: string; description: string; content: string; persona: string; skillNames: string[]; modelInvocable: boolean; userInvocable: boolean; revision: number; managed: boolean }
const blank = (): Draft => ({ id: '', name: '', description: '', content: '', persona: '', skillNames: [], modelInvocable: true, userInvocable: true, revision: 0, managed: true })

/** Independent reusable capability library. Applications appear only as consumers. */
export function ManagementCatalogView({ tab, active, apps, query, commands, t }: {
  tab: 'agents' | 'skills'; active: boolean; apps: readonly WorkbenchAppDefinition[]; query: string; commands: ManagementCommands; t: (key: keyof typeof en) => string
}) {
  const [catalog, setCatalog] = useState<ManagementCatalog | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState('')
  const [contentReady, setContentReady] = useState(true)
  useEffect(() => { setSelected(null); setDraft(null); setError(null); setNotice('') }, [tab])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setBusy(true)
    void managementCall({ action: 'catalog' }, controller.signal).then(body => {
      if (body?.version !== 1 || !Array.isArray(body.agents) || !Array.isArray(body.roles) || !Array.isArray(body.skills)) throw new Error('管理目录格式错误')
      if (!controller.signal.aborted) { setCatalog(body); setError(null) }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '管理服务不可用') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [active, reload])
  useEffect(() => {
    if (tab !== 'skills' || !selected) return
    const controller = new AbortController()
    void managementCall({ action: 'skill-read', name: selected }, controller.signal).then(body => {
      if (!controller.signal.aborted) { setDraft(value => value?.id === selected ? { ...value, content: body.content ?? body.skill?.content ?? '' } : value); setContentReady(true) }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败') })
    return () => controller.abort()
  }, [selected, tab])
  const change = (patch: Partial<Draft>) => setDraft(value => value ? { ...value, ...patch } : value)
  const run = async (request: ManagementRequest, success: string) => {
    setBusy(true); setError(null); setNotice('')
    try { const body = await managementCall(request); setNotice(success); setReload(value => value + 1); return body }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); return null }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!draft) return
    const body = await run(tab === 'agents' ? { action: 'agent-save', expectedRevision: draft.revision, agent: { id: draft.id, name: draft.name, description: draft.description, persona: draft.persona, skillNames: draft.skillNames, modelInvocable: draft.modelInvocable, userInvocable: draft.userInvocable } }
      : { action: 'skill-save', expectedRevision: draft.revision, skill: { name: draft.id, description: draft.description, content: draft.content, modelInvocable: draft.modelInvocable, userInvocable: draft.userInvocable } }, '已保存')
    if (body) { setSelected(draft.id); setDraft(value => value ? { ...value, revision: body.agent?.revision ?? body.skill?.revision ?? body.revision ?? value.revision } : value) }
  }
  const matches = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  const label = (id: string) => apps.find(app => app.id === id)?.name ?? id
  const roles = catalog?.roles.filter(role => tab === 'agents' ? role.presetId === (catalog?.agents?.find(agent => agent.id === selected)?.presetId ?? selected) : role.assignment.names.includes(selected ?? '')) ?? []
  const agentUsers = catalog?.agents?.filter(agent => agent.skillNames.includes(selected ?? '')) ?? []
  return <section className="pwb-independent-management" aria-label={t(tab)}>
    <style>{independentManagementStyles}</style>
    <div className="pim-toolbar"><p>{tab === 'agents' ? '统一管理可复用 Agent，供应用和任务使用。' : '统一管理 Skills，供 Agent、应用和任务调用。'}</p>
      <button data-pwb-button data-variant="primary" type="button" onClick={() => { setSelected(null); setDraft(blank()); setContentReady(true); setError(null); setNotice('') }}><Plus size={16} />{tab === 'agents' ? '新建 Agent' : '新建 Skill'}</button>
      <button data-pwb-button type="button" aria-label="刷新目录" disabled={busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /></button></div>
    {busy && <p role="status">正在加载…</p>}{error && <p className="pim-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="pim-columns"><div className="pim-library" aria-label={tab === 'agents' ? 'Agent 库' : 'Skills 库'}>
      {catalog && (tab === 'agents' ? (catalog.agents ?? []).filter(agent => matches(`${agent.name} ${agent.id} ${agent.description}`)).map(agent =>
        <button data-pwb-button type="button" className="pim-card" key={agent.id} aria-pressed={selected === agent.id} onClick={() => { setSelected(agent.id); setError(null); setNotice(''); setDraft({ ...blank(), ...agent, content: '', persona: agent.persona ?? '', skillNames: [...agent.skillNames] }) }}>
          <strong>{agent.name}</strong><span>{agent.description || agent.id}</span><small>{agent.managed ? '自建 Agent' : '原生预设'} · {agent.appIds.map(label).join('、') || '暂无应用引用'}{agent.broken && ` · ${agent.broken}`}</small></button>)
        : catalog.skills.filter(skill => matches(`${skill.name} ${skill.description}`)).map(skill => <button data-pwb-button type="button" className="pim-card" key={skill.name} aria-pressed={selected === skill.name} onClick={() => { setSelected(skill.name); setContentReady(false); setError(null); setNotice(''); setDraft({ ...blank(), ...skill, id: skill.name, content: '', revision: skill.revision ?? 0, managed: skill.managed ?? false }) }}>
          <strong>{skill.name}</strong><span>{skill.description}</span><small>{skill.source} · {skill.appIds.map(label).join('、') || '暂无应用引用'}</small></button>))}
      {catalog && (tab === 'agents' ? !catalog.agents?.length : !catalog.skills.length) && <p>目录为空，创建第一个{tab === 'agents' ? ' Agent' : ' Skill'}。</p>}
    </div><div className="pim-detail">
      {!draft && <p className="pim-placeholder">选择能力查看配置、引用和调用记录。</p>}
      {draft && <><h3>{selected ? draft.name : tab === 'agents' ? '新建 Agent' : '新建 Skill'}</h3>
        <fieldset disabled={busy || !draft.managed || (tab === 'skills' && !contentReady)}>
          <label>唯一标识<input aria-label="唯一标识" value={draft.id} disabled={!!selected} onChange={event => change({ id: event.target.value, ...(tab === 'skills' ? { name: event.target.value } : {}) })} /></label>
          {tab === 'agents' && <label>名称<input aria-label="名称" value={draft.name} onChange={event => change({ name: event.target.value })} /></label>}
          <label>说明<textarea aria-label="说明" rows={2} value={draft.description} onChange={event => change({ description: event.target.value })} /></label>
          <label>{tab === 'agents' ? '角色指令' : 'Skill 内容'}<textarea aria-label={tab === 'agents' ? '角色指令' : 'Skill 内容'} rows={8} value={tab === 'agents' ? draft.persona : draft.content} onChange={event => change(tab === 'agents' ? { persona: event.target.value } : { content: event.target.value })} /></label>
          <div className="pim-toggles"><label><input type="checkbox" checked={draft.userInvocable} onChange={event => change({ userInvocable: event.target.checked })} />允许手动调用</label><label><input type="checkbox" checked={draft.modelInvocable} onChange={event => change({ modelInvocable: event.target.checked })} />允许模型调用</label></div>
          {tab === 'agents' && <div><h4>使用的 Skills</h4>{catalog?.skills.filter(skill => skill.managed&&skill.userInvocable || draft.skillNames.includes(skill.name)).map(skill => <label className="pim-check" key={skill.name}><input type="checkbox" checked={draft.skillNames.includes(skill.name)} onChange={event => change({ skillNames: event.target.checked ? [...draft.skillNames, skill.name] : draft.skillNames.filter(name => name !== skill.name) })} />{skill.name}</label>)}</div>}
          <button data-pwb-button data-variant="primary" type="button" disabled={!draft.id.trim() || !draft.name.trim()} onClick={() => { void save() }}><Save size={16} />保存</button>
          {selected && <button data-pwb-button type="button" onClick={() => { if (window.confirm(`删除 ${draft.name}？引用中的能力需要先解绑。`)) void run(tab === 'agents' ? { action: 'agent-remove', id: draft.id, expectedRevision: draft.revision } : { action: 'skill-remove', name: draft.id, expectedRevision: draft.revision }, '已删除').then(body => { if (body) { setSelected(null); setDraft(null) } }) }}><Trash2 size={16} />删除</button>}
        </fieldset>
        {!draft.managed && <p>由原生插件提供，在原生配置中管理。<button data-pwb-button type="button" disabled={!commands.openBundle} onClick={() => commands.openBundle?.('@deepseek-ai/dsh-agent-preset-registry')}><Settings size={16} />打开配置</button></p>}
        {selected && tab === 'agents' && <button data-pwb-button type="button" disabled={busy || !draft.userInvocable || !commands.openSession} onClick={() => { void run({ action: 'agent-open', id: selected }, '会话已创建').then(body => { if (body?.sessionId) commands.openSession?.(body.sessionId) }) }}><MessageSquare size={16} />使用此 Agent 创建会话</button>}
        <h4>被哪些应用和 Agent 使用</h4>
        {roles.map(role => <p key={JSON.stringify(role.key)}>{label(role.key.appId)} · {role.name}{role.key.subject ? ` · ${role.key.subject}` : ''}</p>)}
        {tab === 'skills' && agentUsers.map(agent => <p key={agent.id}>Agent · {agent.name}</p>)}
        {!roles.length && (tab !== 'skills' || !agentUsers.length) && <p>暂无引用</p>}
        <h4>调用记录</h4>
        {catalog?.executions?.filter(row => row.capabilityId === selected).slice(-20).reverse().map(row => <p key={row.id}>{row.status} · {row.kind} · {row.startedAt}{row.error && ` · ${row.error}`}</p>)}
      </>}
    </div></div>
  </section>
}
