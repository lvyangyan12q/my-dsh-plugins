import { useEffect, useRef, useState } from 'react'
import { useBusinessState } from './view-state.tsx'
import { DocumentMarkdown } from './document-markdown.tsx'
import {useLearningHttp} from './view-context.tsx'

import type { Entry } from './knowledge-reader.tsx'

async function readable(response:Response,description:string){
  if(response.status===403)throw new Error('资料引用已撤销或尚未授权，请在工作台“资料连接”中核对并显式授权后刷新。')
  if(response.status===401)throw new Error('资料访问未获授权，请登录当前DSH并核对资料连接后刷新。')
  if(!response.ok)throw new Error(description+'，当前资料已隐藏，请刷新重试。')
  return response.json()
}

export function StandaloneKnowledgeLibrary({ active = true }: { active?: boolean }) {
  const http=useLearningHttp()
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useBusinessState('reader.query', '')
  const [entries, setEntries] = useBusinessState('reader.entries', [])
  const [selected, setSelected] = useBusinessState('reader.selected', '')
  const [entry, setEntry] = useBusinessState('reader.entry', null)
  const [error, setError] = useBusinessState('reader.error', '')
  const [loading, setLoading] = useBusinessState('reader.loading', false)
  // Retained projections are not proof of current access after reopening a view.
  const [listReady,setListReady]=useState(false),[detailReady,setDetailReady]=useState(false)
  const [refreshId,setRefreshId]=useBusinessState('reader.refresh',0)
  const lastRefresh=useRef(refreshId),validatedTransport=useRef<typeof http|null>(null)
  const generation=useRef(0),listSequence=useRef(0)
  const invalidate=(message:string)=>{
    generation.current++;setEntries([]);setSelected('');setEntry(null);setLoading(false);setError(message);setListReady(false);setDetailReady(false)
  }
  const searchInput = useRef<HTMLInputElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const previousSelection = useRef(selected)
  useEffect(() => {
    if (!active || previousSelection.current === selected) return
    previousSelection.current = selected
    if (selected) backButton.current?.focus()
    else searchInput.current?.focus()
  }, [selected, active])
  useEffect(()=>{
    if(lastRefresh.current!==refreshId){lastRefresh.current=refreshId;invalidate('正在重新核对资料授权…')}
    return()=>{generation.current++}
  },[http,refreshId])
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    const refresh = () => {
      const ticket=generation.current,sequence=++listSequence.current
      const current=()=>!abort.signal.aborted&&generation.current===ticket&&listSequence.current===sequence
      setError('')
      http.fetch('/api/kaogong/knowledge?q=' + encodeURIComponent(query), { signal: abort.signal })
        .then(r=>readable(r,'知识库加载失败'))
        .then(data => { if (!Array.isArray(data?.entries)) throw new Error('知识库返回了无法识别的数据'); if (current()){setEntries(data.entries);validatedTransport.current=http;setListReady(true)} })
        .catch(e => { if (current()) invalidate(e.message??'资料暂时无法读取，请核对连接后刷新。') })
    }
    const timer = setTimeout(refresh, 250)
    const interval = setInterval(refresh, 15000)
    return () => { clearTimeout(timer); clearInterval(interval); abort.abort() }
  }, [query, active,http,refreshId])
  useEffect(() => {
    if (!active) return
    if (!selected) { setEntry(null);setDetailReady(false); return }
    const abort = new AbortController()
    const ticket=generation.current,current=()=>!abort.signal.aborted&&generation.current===ticket
    setLoading(true)
    setDetailReady(false)
    setEntry(null)
    setError('')
    http.fetch('/api/kaogong/knowledge?id=' + encodeURIComponent(selected), { signal: abort.signal })
      .then(r=>readable(r,'资料正文加载失败'))
      .then(value => { if(typeof value?.title!=='string'||typeof value?.content!=='string')throw new Error('资料正文返回了无法识别的数据');if (current()){setEntry({ ...value, id: selected });setDetailReady(true)} })
      .catch(e => { if (current()) invalidate(e.message??'资料暂时无法读取，请核对连接后刷新。') })
      .finally(() => { if (current()) setLoading(false) })
    return () => abort.abort()
  }, [selected, active,http,refreshId])
  const verified=active&&listReady&&validatedTransport.current===http
  const visibleEntries=verified?entries:[]
  const filtered = visibleEntries.filter(item => (!subject || item.subject === subject) && (!kind || item.kind === kind))
  return <div aria-label="考公独立资料">
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    <button data-pwb-button type="button" onClick={()=>{invalidate('正在重新核对资料授权…');setRefreshId(value=>value+1)}}>刷新资料</button>
    {selected ? <>
      <button ref={backButton} data-pwb-button type="button" onClick={() => setSelected('')} style={{ margin: '12px 0' }}>返回资料列表</button>
      {loading && <p>正在加载正文…</p>}
      {verified&&detailReady&&entry && <article>
        <h3 style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{entry.title}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>{entry.subject} · {entry.kind} · {entry.source}</p>
        <DocumentMarkdown content={entry.content} imageContext={{entryId:entry.id}} />
      </article>}
    </> : <>
      <input ref={searchInput} aria-label="搜索知识库" placeholder="搜索标题、科目或正文" value={query} onChange={event => setQuery(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, margin: '12px 0', border: '1px solid #d1d5db', borderRadius: 4 }} />
      <label>科目<select aria-label="科目" value={subject} onChange={event => setSubject(event.target.value)}><option value="">全部</option>{[...new Set(visibleEntries.map(item => item.subject))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>资料类型<select aria-label="资料类型" value={kind} onChange={event => setKind(event.target.value)}><option value="">全部</option>{[...new Set(visibleEntries.map(item => item.kind))].map(value => <option key={value}>{value}</option>)}</select></label>
      <div style={{ color: '#6b7280', fontSize: 12 }}>{verified?filtered.length+' 条资料':'资料尚未载入'}</div>
      {filtered.map(item => <article key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
        <button type="button" onClick={() => setSelected(item.id)} style={{ background: 'none', border: 0, color: '#1d4ed8', padding: 0, fontSize: 14, textAlign: 'left', overflowWrap: 'anywhere', cursor: 'pointer' }}>{item.title}</button>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{item.subject} · {item.kind}</div>
      </article>)}
    </>}
  </div>
}
