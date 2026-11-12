import { useState } from 'react'
import type { ClassroomClient } from './classroom-client.ts'
import type { LinkResolveView } from './contract.ts'

export interface LinkInsertProps {
  client: ClassroomClient
  spaceId: string
  /** Space-relative note path, so `[[#标题]]` can point at this note. */
  fromPath: string
  /** Insert the resolved canonical link at the editor caret. */
  onInsert: (link: string) => { ok: boolean; message: string }
}

const styles = `
.lc-link-insert{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:#f6f8fa}
.lc-link-insert-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
.lc-link-insert label{display:flex;flex:1 1 240px;flex-direction:column;gap:4px;min-width:0;font-size:12px}
.lc-link-insert input{box-sizing:border-box;width:100%;min-width:0;padding:5px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font:inherit;font-size:13px}
.lc-link-insert button{padding:5px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-link-insert button:disabled{opacity:.5;cursor:default}
.lc-link-insert p{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e);overflow-wrap:anywhere}
.lc-link-insert .lc-link-candidates{display:flex;flex-wrap:wrap;gap:6px}
`

/**
 * Resolve an Obsidian-style target against the real vault, then insert the
 * canonical Vault-relative link. Ambiguous, missing and out-of-vault targets
 * stay visible with candidates or an explanation and are never inserted.
 */
export function LinkInsert({ client, spaceId, fromPath, onInsert }: LinkInsertProps) {
  const [target, setTarget] = useState('')
  const [result, setResult] = useState<LinkResolveView | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const resolveLink = client.resolveLink
  const supportsResolve = typeof resolveLink === 'function'

  const resolve = async (): Promise<void> => {
    if (resolveLink === undefined) return
    const wanted = target.trim()
    if (wanted === '') {
      setResult(null)
      setNotice('请先填写要引用的文件、标题或块。')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      setResult(await resolveLink({ action: 'link-resolve', spaceId, target: wanted, fromPath }))
    } catch (error) {
      setResult(null)
      setNotice(error instanceof Error ? error.message : '双链解析失败。')
    } finally {
      setBusy(false)
    }
  }

  const insert = (): void => {
    if (result === null || result.status !== 'ok' || result.link === null) return
    const outcome = onInsert(result.link)
    setNotice(outcome.message)
  }

  if (!supportsResolve) return null

  return (
    <div className="lc-link-insert" aria-label="插入双链">
      <style>{styles}</style>
      <div className="lc-link-insert-row">
        <label>
          双链目标
          <input
            aria-label="双链目标"
            placeholder="文件名、文件#标题 或 文件#^已有块id"
            value={target}
            disabled={busy}
            maxLength={500}
            onChange={event => { setTarget(event.target.value); setResult(null); setNotice('') }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void resolve()
              }
            }}
          />
        </label>
        <button type="button" disabled={busy || target.trim() === ''} onClick={() => { void resolve() }}>解析双链</button>
        {result?.status === 'ok' && result.link !== null && (
          <button type="button" disabled={busy} onClick={insert}>插入双链</button>
        )}
      </div>

      {result !== null && result.status !== 'ok' && (
        <p role="alert">{result.message ?? '这条双链无法解析。'}</p>
      )}
      {result !== null && result.candidates.length > 0 && (
        <div className="lc-link-candidates" aria-label="双链候选">
          {result.candidates.map(candidate => (
            <button key={candidate} type="button" onClick={() => { setTarget(candidate); setResult(null); setNotice('') }}>
              {candidate}
            </button>
          ))}
        </div>
      )}
      {result?.status === 'ok' && result.file !== null && (
        <p role="status">已确认真实文件：{result.file}{result.heading === null ? '' : `#${result.heading}`}{result.blockId === null ? '' : `#^${result.blockId}`}</p>
      )}
      {notice !== '' && <p role="status">{notice}</p>}
      <p>只插入 Host 确认存在的文件、标题或已有块；同名歧义、缺失和越界不会猜测。</p>
    </div>
  )
}
