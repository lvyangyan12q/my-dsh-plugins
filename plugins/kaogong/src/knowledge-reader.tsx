import { useEffect, useState } from 'react'
import { DocumentMarkdown } from './document-markdown.tsx'

type Entry = { id: string; title: string; subject: string; kind: string; source: string; content: string }

export function KnowledgeLibrary() {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState('')
  const [entry, setEntry] = useState<Entry | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    const refresh = () => {
      setError('')
      fetch('/api/kaogong/knowledge?q=' + encodeURIComponent(query), { signal: abort.signal })
        .then(async r => { if (!r.ok) throw new Error('知识库加载失败'); return r.json() })
        .then(data => setEntries(data.entries))
        .catch(e => { if (!abort.signal.aborted) setError(e.message) })
    }
    const timer = setTimeout(refresh, 250)
    const interval = setInterval(refresh, 15000)
    return () => { clearTimeout(timer); clearInterval(interval); abort.abort() }
  }, [query])
  useEffect(() => {
    if (!selected) { setEntry(null); return }
    const abort = new AbortController()
    setLoading(true)
    setEntry(null)
    setError('')
    fetch('/api/kaogong/knowledge?id=' + encodeURIComponent(selected), { signal: abort.signal })
      .then(async r => { if (!r.ok) throw new Error('资料正文加载失败'); return r.json() })
      .then(setEntry)
      .catch(e => { if (!abort.signal.aborted) setError(e.message) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [selected])
  return <div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {selected ? <>
      <button type="button" onClick={() => setSelected('')} style={{ margin: '12px 0' }}>返回资料列表</button>
      {loading && <p>正在加载正文…</p>}
      {entry && <article>
        <h3 style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{entry.title}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>{entry.subject} · {entry.kind} · {entry.source}</p>
        <DocumentMarkdown content={entry.content} />
      </article>}
    </> : <>
      <input aria-label="搜索知识库" placeholder="搜索标题、科目或正文" value={query} onChange={event => setQuery(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, margin: '12px 0', border: '1px solid #d1d5db', borderRadius: 4 }} />
      <div style={{ color: '#6b7280', fontSize: 12 }}>{entries.length} 条资料</div>
      {entries.map(item => <article key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
        <button type="button" onClick={() => setSelected(item.id)} style={{ background: 'none', border: 0, color: '#1d4ed8', padding: 0, fontSize: 14, textAlign: 'left', overflowWrap: 'anywhere', cursor: 'pointer' }}>{item.title}</button>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{item.subject} · {item.kind}</div>
      </article>)}
    </>}
  </div>
}
