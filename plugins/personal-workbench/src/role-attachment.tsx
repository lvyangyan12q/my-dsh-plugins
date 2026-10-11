import { useState } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Explicit binding chooser; the native roster is read without acquiring Sessions. */
export function RoleAttachment({ bindingKey, expectedSessionId, commands, close, useSessions, useWorkspaces, t }: FactoryComponentPropsOf<'personal-workbench.role-attachment'>) {
  const sessions = useSessions(value => value)
  const workspaces = useWorkspaces(value => value)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = sessions.phase === 'ready' && workspaces.phase === 'ready'
  const rows = ready ? sessions.ids.map(id => sessions.byId[id]).filter(row => row && row.origin !== 'subagent' && !workspaces.archivedSessionIds.includes(row.id)) : []
  const attach = async () => {
    if (!commands.attach || !rows.some(row => row.id === selected)) return
    setBusy(true); setError(null)
    try { await commands.attach(bindingKey, selected as SessionId, expectedSessionId); close() }
    catch (error) { setError(error instanceof Error ? error.message : t('roleAttachFailed')) }
    finally { setBusy(false) }
  }
  return <section aria-label={t('roleAttach')} style={{ padding: 12, borderBottom: '1px solid var(--dsw-alias-border-base, #ddd)', display: 'grid', gap: 8 }}>
    <label style={{ display: 'grid', gap: 6 }}>{t('roleExistingSession')}
      <select data-pwb-field value={selected} disabled={!ready || busy} onChange={event => setSelected(event.target.value)}>
        <option value="">{t('roleChooseSession')}</option>
        {rows.map(row => <option key={row.id} value={row.id}>{row.displayTitle} · {row.id}{row.cwd ? ' · ' + row.cwd : null}</option>)}
      </select>
    </label>
    <small>{t('roleAttachHelp')}</small>
    {!ready && <p role="status">{t('roleSessionsLoading')}</p>}
    {ready && rows.length === 0 && <p>{t('roleSessionsEmpty')}</p>}
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      <button data-pwb-button data-variant="primary" disabled={busy || !selected || !commands.attach} onClick={() => { void attach() }}>{t('roleAttachConfirm')}</button>
      <button data-pwb-button disabled={busy} onClick={close}>{t('roleAttachCancel')}</button>
    </div>
  </section>
}
