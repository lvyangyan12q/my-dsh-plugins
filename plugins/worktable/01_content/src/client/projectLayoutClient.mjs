/** Project-bound layout snapshots and save queue. No browser globals are read by queued work. */
const copy = value => JSON.parse(JSON.stringify(value))

export async function requestProjectLayout(body) {
  try {
    const response = await fetch('/api/worktable/project-layout', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
    const result = await response.json()
    if (!result || typeof result.status !== 'string') throw new Error('布局服务返回无效结果')
    return result
  } catch (error) {
    return {status:'error',message:error instanceof Error ? error.message : String(error)}
  }
}

export class ProjectLayoutClient {
  constructor({request=requestProjectLayout, delay=600, onChange=()=>{}}={}) {
    this.request=request; this.delay=delay; this.onChange=onChange; this.entries=new Map(); this.aliases=new Map()
  }
  entry(folder) {
    const key=this.aliases.get(folder) ?? folder
    if (!this.entries.has(key)) this.entries.set(key,{folder:key,revision:null,writable:false,status:'idle',message:'',pending:null,timer:null,running:null,sequence:0,readSequence:0})
    return this.entries.get(key)
  }
  state(folder) { const e=this.entry(folder); return {folder:e.folder,status:e.status,message:e.message,revision:e.revision,pending:!!e.pending} }
  notify(e) { this.onChange(this.state(e.folder)) }
  async read(folder,projectId,legacyFile,explicitRetry=false) {
    await this.flush(folder)
    const e=this.entry(folder), seq=++e.readSequence
    if(e.pending && !e.writable && !explicitRetry)return {status:e.status,message:e.message,folder:e.folder}
    const result=await this.request({action:'read',folder,projectId,legacyFile})
    if (seq!==e.readSequence) return {status:'stale'}
    if (result.folder && result.folder!==e.folder) {
      const existing=this.entries.get(result.folder)
      if (existing && existing!==e && (existing.running || existing.pending)) return {status:'conflict',message:'同一目录已有未保存的布局'}
      this.aliases.set(folder,result.folder); this.entries.delete(e.folder); e.folder=result.folder; this.entries.set(e.folder,e)
    }
    e.writable=['ok','missing','legacy'].includes(result.status)
    e.revision=result.status==='ok'?result.document.revision:null
    e.projectId=result.document?.project?.id ?? projectId
    e.status=result.status==='ok'?'saved':result.status==='missing'||result.status==='legacy'?'unsaved':result.status
    e.message=result.message ?? ''; this.notify(e)
    return result
  }
  schedule(folder,layout) {
    const e=this.entry(folder)
    if (e.projectId && e.projectId!==layout.project.id) {e.status='conflict';e.message='该目录已属于另一个项目';e.writable=false;this.notify(e);return}
    e.projectId=layout.project.id
    e.pending={layout:copy(layout),sequence:++e.sequence}
    if (e.timer) clearTimeout(e.timer)
    if (e.writable) { e.status='saving';e.message='';e.timer=setTimeout(()=>{e.timer=null;void this.flush(e.folder)},this.delay) }
    this.notify(e)
  }
  async flush(folder) {
    const e=this.entry(folder)
    if (e.timer) {clearTimeout(e.timer);e.timer=null}
    if (e.running) { await e.running; if(e.writable && e.pending) return this.flush(e.folder); return }
    if (!e.writable || !e.pending) return
    const pending=e.pending; e.pending=null; e.status='saving'; this.notify(e)
    e.running=(async()=>{
      let result
      try {result=await this.request({action:'save',folder:e.folder,expectedRevision:e.revision,layout:pending.layout})}
      catch(error) {result={status:'error',message:String(error)}}
      if (result.status==='ok') {
        e.revision=result.document.revision;e.status=e.pending?'saving':'saved';e.message=''
      } else {
        if (!e.pending) e.pending=pending
        e.status=result.status;e.message=result.message ?? '布局尚未保存';e.writable=false
      }
      this.notify(e)
    })()
    await e.running; e.running=null
    if(e.writable && e.pending) return this.flush(e.folder)
  }
  async flushAll() { await Promise.all([...this.entries.values()].map(e=>this.flush(e.folder))) }
  async retry(folder) {
    const e=this.entry(folder)
    const result=await this.read(folder,e.projectId,undefined,true)
    if (!e.writable) return result
    if (e.pending) await this.flush(e.folder)
    return result
  }
  discard(folder) { const e=this.entry(folder); if(e.timer)clearTimeout(e.timer);e.pending=null;e.timer=null }
  dispose() { for(const e of this.entries.values())if(e.timer)clearTimeout(e.timer) }
}

export function layoutSnapshot(spec, geometry, name=spec.title) {
  const clean=copy(spec)
  delete clean.preferFileGeometry; delete clean.fileGeometry
  return {project:{id:spec.id,name:name || spec.title || spec.id},spec:clean,geometry:copy(geometry)}
}

export function projectForDirectory(projects, document, folder) {
  const id=document.project.id
  const normal=p=>{const value=p.replace(/\\/g,'/').replace(/\/+$/,'');return /^[A-Za-z]:|^\/\//.test(value)?value.toLowerCase():value}
  const own=projects.folders[id]
  if (own && normal(own)!==normal(folder)) return {error:'相同项目身份已经关联其他目录，请先处理原登记'}
  const duplicate=Object.entries(projects.folders).find(([other,p])=>other!==id && normal(p)===normal(folder))
  if (duplicate) return {error:'该目录已登记为另一个项目，请从现有项目打开'}
  return {spec:{...document.spec,id,title:document.project.name},folder}
}

export async function resolveProjectDirectory(projects, document, folder, request=requestProjectLayout) {
  const entries=await Promise.all(Object.entries(projects.folders).map(async([id,path])=>{
    if(path===folder)return [id,path]
    const result=await request({action:'read',folder:path,projectId:id})
    return [id,result.folder ?? path]
  }))
  return projectForDirectory({...projects,folders:Object.fromEntries(entries)},document,folder)
}
