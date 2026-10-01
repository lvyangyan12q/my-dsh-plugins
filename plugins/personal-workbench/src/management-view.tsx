import { useEffect, useState } from 'react'
import { RefreshCw, Save, Settings } from 'lucide-react'
import type { ManagementCatalog, ManagedRole, ManagementRequest } from './management-api.ts'
import type { WorkbenchAppDefinition } from './workbench-api.ts'
import type { en } from './locale.ts'

export interface ManagementCommands { openBundle?: (name: string) => void }
export async function managementCall(request: ManagementRequest, signal?: AbortSignal) {
  const response = await fetch('/api/personal-workbench/management', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal })
  let body
  try { body = await response.json() } catch { throw new Error('Management response unavailable') }
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Management unavailable')
  return body
}
const identity = (role: ManagedRole) => JSON.stringify(role.key)

/** Shares the workbench catalog surface; does not retain, create or send native Sessions. */
export function ManagementCatalogView({ tab, active, apps, query, commands, t }: {
  tab: 'agents' | 'skills'; active: boolean; apps: readonly WorkbenchAppDefinition[]; query: string;
  commands: ManagementCommands; t: (key: keyof typeof en) => string
}) {
  const [catalog, setCatalog] = useState<ManagementCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [names, setNames] = useState<readonly string[]>([])
  const [revision, setRevision] = useState(0)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setBusy(true)
    void managementCall({ action: 'catalog' }, controller.signal).then(body => {
      if (body?.version !== 1 || !Array.isArray(body.roles) || !Array.isArray(body.presets) || !Array.isArray(body.skills)) throw new Error('Invalid management catalog')
      if (!controller.signal.aborted) { setCatalog(body); setError(null) }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Management unavailable') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [active, reload, apps])
  const role = catalog?.roles.find(row => identity(row) === selected)
  const select = (value: ManagedRole) => { setSelected(identity(value)); setNames(value.assignment.names); setRevision(value.assignment.revision); setError(null) }
  const save = async () => {
    if (!role) return
    setBusy(true)
    try {
      const body = await managementCall({ action: 'assign', key: role.key, expectedRevision: revision, names })
      setRevision(body.assignment.revision)
      setCatalog(value => value ? { ...value, roles: value.roles.map(row => identity(row) === selected ? { ...row, assignment: body.assignment } : row) } : value)
      setError(null)
      setReload(value => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Save failed') } finally { setBusy(false) }
  }
  const matches = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  return <section className="pwb-management" aria-label={t(tab)}>
    <div className="pwb-management-actions">
      <button type="button" title={t('refreshCatalog')} aria-label={t('refreshCatalog')} disabled={busy} onClick={() => { setReload(value => value + 1); setSelected(null) }}><RefreshCw size={16} /></button>
      <button type="button" title={t('nativeConfiguration')} aria-label={t('nativeConfiguration')} disabled={!commands.openBundle}
        onClick={() => commands.openBundle?.('@deepseek-ai/dsh-personal-workbench')}><Settings size={16} /></button>
    </div>
    {!commands.openBundle && <p className="pwb-meta">{t('navigationUnavailable')}</p>}
    {busy && <p role="status">{t('catalogLoading')}</p>}
    {error && <p role="alert" className="pwb-dependencies">{error}</p>}
    {catalog && tab === 'agents' && <>
      {[...new Set(catalog.roles.map(row => row.key.appId))].map(appId => <div key={appId} className="pwb-role-group">
        <h3>{apps.find(app => app.id === appId)?.name ?? appId}</h3>
        {catalog.roles.filter(row => row.key.appId === appId && matches(`${row.name} ${row.key.subject ?? ''} ${row.presetId}`)).map(row =>
          <button className="pwb-role-row" type="button" key={identity(row)} aria-pressed={identity(row) === selected} onClick={() => select(row)}>
            <span>{apps.find(app => app.id === appId)?.roles?.find(value => value.id === row.key.roleId)?.name ?? row.name}{row.key.subject && ` · ${row.key.subject}`}</span>
            <small>{row.key.instanceId} · {row.source} · {t(row.available ? 'catalogAvailable' : 'catalogUnavailable')}</small>
          </button>)}
      </div>)}
      {!!catalog.presets.length && <div className="pwb-role-group"><h3>{t('nativePresets')}</h3>{catalog.presets.filter(row => matches(`${row.name ?? ''} ${row.id}`)).map(row =>
        <div className="pwb-role-row" key={row.id}><span>{row.name ?? row.id}</span><small>{t('nativeRegistry')} · {row.broken ?? t('catalogAvailable')}</small></div>)}</div>}
      {!catalog.roles.length && !catalog.presets.length && <p className="pwb-empty">{t('catalogEmpty')}</p>}
    </>}
    {catalog && tab === 'skills' && <>
      {!role && catalog.globalSkillError && <p role="alert">{catalog.globalSkillError}</p>}
      <label className="pwb-field">{t('roleScope')}<select aria-label={t('roleScope')} value={selected ?? ''} onChange={event => {
        const value = catalog.roles.find(row => identity(row) === event.target.value)
        if (value) select(value); else setSelected(null)
      }}><option value="">{t('globalScope')}</option>{catalog.roles.map(row => <option key={identity(row)} value={identity(row)}>{apps.find(app => app.id === row.key.appId)?.name ?? row.key.appId} · {row.name} · {row.key.subject ?? row.key.instanceId}</option>)}</select></label>
      {!role && catalog.skills.filter(skill => matches(`${skill.name} ${skill.description} ${skill.source} ${skill.provider}`)).map(skill =>
        <div className="pwb-skill-row" key={skill.name}><strong>{skill.name}</strong><span>{skill.description}</span><small>{skill.source} · {skill.provider} · {skill.appIds.join(', ') || t('ownershipUnknown')}</small></div>)}
      {!role && !catalog.skills.length && <p className="pwb-empty">{t('catalogEmpty')}</p>}
    </>}
    {role && <div className="pwb-role-detail">
      <h3>{role.name}{role.key.subject && ` · ${role.key.subject}`}</h3>
      <dl><dt>{t('preset')}</dt><dd>{role.presetId}</dd><dt>{t('sessionIdentity')}</dt><dd>{role.binding?.sessionId ?? t('sessionNotCreated')}</dd>
        <dt>{t('modelUsed')}</dt><dd>{role.model?.lastUsed ? `${role.model.lastUsed.provider} / ${role.model.lastUsed.model}` : t('notObserved')}</dd>
        <dt>{t('modelNext')}</dt><dd>{role.model?.next ? `${role.model.next.provider} / ${role.model.next.model}` : t('nativeDefault')}</dd>
        <dt>{t('nativePermission')}</dt><dd>{role.permissions.currentValue ?? t('notObserved')} · {role.permissions.provenance}</dd>
        <dt>{t('sandboxMode')}</dt><dd>{role.permissions.sandboxMode ?? t('notObserved')} · {role.permissions.sandboxOrigin}</dd><dt>{t('approvalPolicy')}</dt><dd>{role.permissions.approvalPolicy ?? t('notObserved')} · {role.permissions.approvalOrigin}</dd>
        <dt>{t('workspaceRoot')}</dt><dd>{role.permissions.workspaceRoot ?? t('notObserved')}</dd>
        <dt>{t('visibleTools')}</dt><dd>{role.tools.map(tool => tool.name).join(', ') || t('notObserved')} · {role.scope}</dd>
      </dl>
      {role.error && <p role="alert">{role.error}</p>}
      {role.missingNames.length > 0 && <p role="alert">{t('missingAssigned')}: {role.missingNames.join(', ')}</p>}
      <h3>{t('assignedSkills')}</h3>
      {role.skills.filter(skill => matches(`${skill.name} ${skill.description}`)).map(skill => <label className="pwb-skill-row" key={skill.name}>
        <span><input type="checkbox" disabled={busy || !role.available || (!skill.userInvocable && !names.includes(skill.name))} checked={names.includes(skill.name)}
          onChange={event => setNames(value => event.target.checked ? [...value, skill.name] : value.filter(name => name !== skill.name))} />{skill.name}</span>
        <small>{skill.source} · {skill.provider} · {t(skill.userInvocable ? 'catalogAvailable' : 'invocationDisabled')}</small>
        <span>{skill.description}</span>
      </label>)}
      {names.filter(name => !role.skills.some(skill => skill.name === name)).map(name => <label className="pwb-skill-row" key={name}><span><input type="checkbox" checked onChange={() => setNames(value => value.filter(item => item !== name))} />{name}</span><small>{t('catalogUnavailable')}</small></label>)}
      <button type="button" title={t('saveAssignment')} aria-label={t('saveAssignment')} disabled={busy || !role.available || !catalog?.runtimeAvailable} onClick={() => { void save() }}><Save size={16} /></button>
      <p className="pwb-meta">{t('nextTurnAssignment')}</p>
      <h3>{t('nativeLoadEvidence')}</h3>
      {role.loaded.length ? <ul>{role.loaded.map(load => <li key={load.seq}>{load.name} · #{load.seq}</li>)}</ul> : <p className="pwb-meta">{t('notObserved')}</p>}
      {role.bundleName && <button type="button" disabled={!commands.openBundle} title={t('nativeConfiguration')} onClick={() => commands.openBundle?.(role.bundleName!)}><Settings size={16} /></button>}
    </div>}
  </section>
}
