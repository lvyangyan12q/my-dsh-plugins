import { useState } from 'react'
import type { AskQuestionResult, AskedContext } from './question-context.ts'
import { questionMaterialLabel } from './question-context.ts'

/**
 * The context strip above the embedded teacher composer.
 *
 * It shows exactly the blocks this page appended and whether the native draft
 * still contains each of them. "移除" asks the Host to take that block back out
 * of the draft; it never touches an already sent message, and it never rewrites
 * the learner's other text silently.
 */
export interface QuestionContextBarProps {
  /** Blocks appended in this space, in append order. */
  contexts: readonly AskedContext[]
  /** Current native draft, or null when it cannot be read. */
  draft: string | null
  /** Remove one block from the native draft. */
  onRemove(id: string): Promise<AskQuestionResult>
  /** Forget one block that is no longer in the draft (already sent or edited). */
  onDismiss(id: string): void
}

const styles = `
.lc-question-bar{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:#f6f8fa}
.lc-question-bar h3{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-question-bar p{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e);overflow-wrap:anywhere}
.lc-question-bar ul{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.lc-question-bar li{display:flex;flex-direction:column;gap:2px;padding:4px 0;border-top:1px solid var(--dsh-border,#d8dee4)}
.lc-question-bar li:first-child{border-top:0}
.lc-question-item-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.lc-question-item-head strong{font-size:12px}
.lc-question-badge{padding:0 6px;border-radius:999px;background:#fff8c5;color:#7d4e00;font-size:11px}
.lc-question-badge[data-state="missing"]{background:#eaeef2;color:#59636e}
.lc-question-actions{display:flex;flex-wrap:wrap;gap:6px}
.lc-question-actions button{padding:2px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-question-bar pre{margin:0;max-height:180px;overflow:auto;padding:6px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.5}
.lc-question-notice{margin:0;font-size:12px;color:#1a7f37}
.lc-question-notice[role="alert"]{color:#d1242f}
`

function hasVersion(version: string | null | undefined): version is string {
  return typeof version === 'string' && version.trim() !== ''
}

function shortVersion(context: AskedContext): string {
  if (context.unsaved) {
    return hasVersion(context.version) ? `未保存（基于 ${shortHash(context.version)}）` : '未保存（基础版本未知）'
  }
  if (!hasVersion(context.version)) return '版本未知'
  return shortHash(context.version)
}

function shortHash(version: string): string {
  return version.length > 16 ? `${version.slice(0, 12)}…` : version
}

export function QuestionContextBar(props: QuestionContextBarProps) {
  const { contexts, draft } = props
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const remove = async (context: AskedContext) => {
    if (busy !== null) return
    setBusy(context.id)
    try {
      const result = await props.onRemove(context.id)
      setNotice(result.ok
        ? { ok: true, text: '已移除这段提问上下文；草稿其余内容没有改动。' }
        : { ok: false, text: result.reason })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="lc-question-bar" aria-label="提问上下文条">
      <style>{styles}</style>
      <h3>{contexts.length === 0 ? '提问上下文' : `提问上下文（${contexts.length}）`}</h3>
      {contexts.length === 0
        ? (
          <p>还没有待发送的提问上下文。在讲义或笔记里点“问老师”，选段会追加到这里显示的草稿里；不会自动发送。</p>
        )
        : <p>会追加到老师输入框，不会自动发送；发送前可在这里查看或移除。</p>}
      {contexts.length > 0 && (
        <ul>
          {contexts.map(context => {
            const present = draft === null ? null : draft.includes(context.block)
            const label = questionMaterialLabel(context)
            return (
              <li key={context.id}>
                <div className="lc-question-item-head">
                  <strong>{label}</strong>
                  <span className="lc-question-badge" data-state={present === false ? 'missing' : undefined}>
                    {present === false ? '已不在草稿' : context.unsaved ? '未保存笔记' : '已追加'}
                  </span>
                  <span className="lc-question-badge">{shortVersion(context)}</span>
                </div>
                <p className="lc-question-path">{context.path}</p>
                {present === false && <p>已不在草稿中（可能已发送）；历史消息不受影响。</p>}
                <div className="lc-question-actions">
                  <button
                    type="button"
                    className="lc-secondary"
                    aria-label={`${expanded === context.id ? '收起摘录' : '查看摘录'}：${label}`}
                    onClick={() => setExpanded(current => (current === context.id ? null : context.id))}
                  >
                    {expanded === context.id ? '收起摘录' : '查看摘录'}
                  </button>
                  {present === false
                    ? (
                      <button
                        type="button"
                        className="lc-secondary"
                        aria-label={`从列表移除：${label}`}
                        onClick={() => props.onDismiss(context.id)}
                      >
                        从列表移除
                      </button>
                    )
                    : (
                      <button
                        type="button"
                        className="lc-secondary"
                        aria-label={`移除上下文：${label}`}
                        disabled={busy !== null || present === null}
                        title={present === null ? '无法读取原生草稿，暂不能移除' : undefined}
                        onClick={() => { void remove(context) }}
                      >
                        {busy === context.id ? '移除中…' : '移除上下文'}
                      </button>
                    )}
                </div>
                {expanded === context.id && <pre>{context.block}</pre>}
              </li>
            )
          })}
        </ul>
      )}
      {notice !== null && (
        <p className="lc-question-notice" role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>
      )}
    </section>
  )
}
