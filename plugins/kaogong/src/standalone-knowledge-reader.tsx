import { useEffect, useState } from 'react'
import { useBusinessState } from './view-state.tsx'
import { DocumentMarkdown } from './document-markdown.tsx'

import type { Entry } from './knowledge-reader.tsx'

export function StandaloneKnowledgeLibrary({ active = true }: { active?: boolean }) {
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useBusinessState('reader.query', '')
  const [entries, setEntries] = useBusinessState('reader.entries', [])
  const [selected, setSelected] = useBusinessState('reader.selected', '')
  const [entry, setEntry] = useBusinessState('reader.entry', null)
  const [error, setError] = useBusinessState('reader.error', '')
  const [loading, setLoading] = useBusinessState('reader.loading', false)
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    const refresh = () => {
      setError('')
      fetch('/api/kaogong/knowledge?q=' + encodeURIComponent(query), { signal: abort.signal })
        .then(async r => { if (!r.ok) throw new Error('知识库加载失败'); return r.json() })
        .then(data => { if (!Array.isArray(data.entries)) throw new Error('知识库返回了无法识别的数据'); if (!abort.signal.aborted) setEntries(data.entries) })
        .catch(e => { if (!abort.signal.aborted) setError(e.message) })
    }
    const timer = setTimeout(refresh, 250)
    const interval = setInterval(refresh, 15000)
    return () => { clearTimeout(timer); clearInterval(interval); abort.abort() }
  }, [query, active])
  useEffect(() => {
    if (!active) return
    if (!selected) { setEntry(null); return }
    if (entry?.id === selected) return
    const abort = new AbortController()
    setLoading(true)
    setEntry(null)
    setError('')
    fetch('/api/kaogong/knowledge?id=' + encodeURIComponent(selected), { signal: abort.signal })
      .then(async r => { if (!r.ok) throw new Error('资料正文加载失败'); return r.json() })
      .then(value => { if (!abort.signal.aborted) setEntry({ ...value, id: selected }) })
      .catch(e => { if (!abort.signal.aborted) setError(e.message) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [selected, active])
  const filtered = entries.filter(item => (!subject || item.subject === subject) && (!kind || item.kind === kind))
  return <div aria-label="考公独立资料">
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {selected ? <>
      <button data-pwb-button type="button" onClick={() => setSelected('')} style={{ margin: '12px 0' }}>返回资料列表</button>
      {loading && <p>正在加载正文…</p>}
      {entry && <article>
        <h3 style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{entry.title}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>{entry.subject} · {entry.kind} · {entry.source}</p>
        <DocumentMarkdown content={entry.content} />
      </article>}
    </> : <>
      <input aria-label="搜索知识库" placeholder="搜索标题、科目或正文" value={query} onChange={event => setQuery(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, margin: '12px 0', border: '1px solid #d1d5db', borderRadius: 4 }} />
      <label>科目<select aria-label="科目" value={subject} onChange={event => setSubject(event.target.value)}><option value="">全部</option>{[...new Set(entries.map(item => item.subject))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>资料类型<select aria-label="资料类型" value={kind} onChange={event => setKind(event.target.value)}><option value="">全部</option>{[...new Set(entries.map(item => item.kind))].map(value => <option key={value}>{value}</option>)}</select></label>
      <div style={{ color: '#6b7280', fontSize: 12 }}>{filtered.length} 条资料</div>
      {filtered.map(item => <article key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
        <button type="button" onClick={() => setSelected(item.id)} style={{ background: 'none', border: 0, color: '#1d4ed8', padding: 0, fontSize: 14, textAlign: 'left', overflowWrap: 'anywhere', cursor: 'pointer' }}>{item.title}</button>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{item.subject} · {item.kind}</div>
      </article>)}
    </>}
  </div>
}
