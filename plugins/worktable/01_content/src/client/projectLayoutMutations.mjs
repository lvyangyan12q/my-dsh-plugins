import {layoutSnapshot,resolveProjectDirectory} from './projectLayoutClient.mjs'

/** User layout mutations share live workspace identities and never navigate on an old save response. */
export class ProjectLayoutMutations {
  constructor({store,workspace,ui,createLayout,makeDirectory,alive=()=>true}) {
    Object.assign(this,{store,workspace,ui,createLayout,makeDirectory,alive})
    this.directorySequences=new Map();this.presetSequences=new Map()
  }
  registered(id) {
    const p=this.workspace.projects()
    return p.layouts.some(l=>l.id===id) || !!p.views[id] || !!this.workspace.meta(id)
  }
  async settleOldFolder(folder) {
    if(!folder)return true
    await this.store.flush(folder)
    if(this.store.state(folder).pending){if(this.alive())this.ui.error('bind','原目录仍有未保存的布局，请先处理保存失败或冲突');return false}
    return true
  }
  async assignDirectory(id,folder,legacyFile) {
    const sequence=(this.directorySequences.get(id) ?? 0)+1;this.directorySequences.set(id,sequence)
    const oldFolder=this.workspace.projects().folders[id],navigation=this.workspace.navigation()
    const current=()=>this.alive() && this.directorySequences.get(id)===sequence && this.workspace.projects().folders[id]===oldFolder && this.registered(id)
    if(!await this.settleOldFolder(oldFolder))return
    if(!current())return
    const result=await this.store.read(folder,id,legacyFile)
    if(!current())return
    folder=result.folder ?? folder
    if(result.status==='ambiguous'){this.ui.choose(result.candidates ?? [],file=>this.assignDirectory(id,folder,file));return}
    if(!['ok','legacy','missing'].includes(result.status)){this.ui.error('bind',result.message ?? '无法读取目录布局，未更改项目目录');return}
    if(result.document){
      const projects=this.workspace.projects()
      const restored=await resolveProjectDirectory({...projects,folders:{...projects.folders,[id]:folder}},result.document,folder)
      if(!current())return
      if(restored.error || result.document.project.id!==id){this.ui.error('bind',restored.error ?? '该目录已有其他项目布局，请使用从目录恢复');return}
      if(result.status==='ok' && !this.ui.confirmLoad())return
    }
    if(result.status==='legacy'){
      this.store.schedule(folder,layoutSnapshot(result.document.spec,result.document.geometry,result.document.project.name))
      await this.store.flush(folder);if(!current())return
      if(this.store.state(folder).status!=='saved'){this.ui.error('bind','布局尚未保存，未更改项目目录');return}
    }
    if(result.status==='missing'){
      while(current()){
        const snapshot=this.workspace.capture(id)
        if(!snapshot)break
        this.store.schedule(folder,snapshot)
        await this.store.flush(folder);if(!current())return
        if(this.store.state(folder).status!=='saved'){this.ui.error('bind','布局尚未保存，未更改项目目录');return}
        if(!await this.settleOldFolder(oldFolder))return
        if(!current())return
        if(JSON.stringify(snapshot)===JSON.stringify(this.workspace.capture(id)))break
      }
    }else if(oldFolder){if(!await this.settleOldFolder(oldFolder))return;if(!current())return}
    if(!current())return
    if(oldFolder!==folder)this.workspace.invalidate(id)
    this.workspace.commit(p=>({...p,folders:{...p.folders,[id]:folder}}))
    this.workspace.reload(id,navigation)
  }
  async changePreset(id,presetId) {
    const sequence=(this.presetSequences.get(id) ?? 0)+1;this.presetSequences.set(id,sequence)
    const folder=this.workspace.projects().folders[id],navigation=this.workspace.navigation()
    const current=()=>this.alive() && this.presetSequences.get(id)===sequence && this.workspace.projects().folders[id]===folder && this.registered(id)
    let stored=null
    if(folder && this.store.state(folder).status==='idle')stored=await this.store.read(folder,id)
    if(!current())return
    const p=this.workspace.projects(),layout=p.layouts.find(l=>l.id===id),meta=this.workspace.meta(id)
    const captured=this.workspace.capture(id),source=captured?.spec ?? stored?.document?.spec ?? layout ?? p.views[id]
    this.workspace.invalidate(id)
    const next=this.createLayout(presetId,layout?.title ?? meta?.name ?? id)
    next.id=id;next.icon=layout?.icon ?? p.iconOverrides[id] ?? meta?.icon
    const panes=s=>[...(s.left?[s.left,...(s.leftMore ?? [])]:[]),...(s.top ?? []),...(s.main ?? [])]
    const tabs=source?panes(source).map(pane=>pane.tabs ?? []).filter(tabs=>tabs.length):[],targets=panes(next)
    targets.forEach((pane,index)=>{if(tabs[index]){pane.tabs=tabs[index];pane.active=0;pane.content=null}})
    if(tabs.length>targets.length && targets.length){const last=targets.at(-1);last.tabs=[...(last.tabs ?? []),...tabs.slice(targets.length).flat()];last.active=0}
    this.workspace.commit(prev=>layout?{...prev,layouts:prev.layouts.map(l=>l.id===id?next:l)}:{...prev,views:{...prev.views,[id]:next}})
    const snapshot=this.workspace.replace(id,next,navigation) ?? layoutSnapshot(next,this.workspace.geometry(next))
    this.ui.presetChanged(id)
    if(folder){this.store.schedule(folder,snapshot);await this.store.flush(folder)}
  }
  async create(name,folder,presetId,isCurrent) {
    const current=()=>this.alive() && isCurrent()
    try{if(!await this.makeDirectory(folder)){if(current())this.ui.error('add','项目目录不可创建');return}}
    catch{if(current())this.ui.error('add','项目目录不可创建');return}
    if(!current())return
    const result=await this.store.read(folder)
    if(!current())return
    if(['ok','legacy','ambiguous'].includes(result.status)){await this.ui.restore(folder);return}
    if(result.status!=='missing'){this.ui.error('add',result.message ?? '目录布局不可读取，未创建项目');return}
    const layout=this.createLayout(presetId,name)
    this.workspace.commit(p=>({...p,layouts:[...p.layouts,layout],folders:{...p.folders,[layout.id]:folder}}))
    this.ui.created(layout)
  }
  async restoreDirectory(folder,legacyFile) {
    const navigation=this.workspace.navigation(),picker=this.workspace.picker()
    const current=()=>this.alive() && this.workspace.navigation()===navigation && this.workspace.picker()===picker
    await this.store.flushAll()
    if(!current())return
    const result=await this.store.read(folder,undefined,legacyFile)
    if(!current())return
    if(result.status==='ambiguous'){this.ui.choose(result.candidates ?? [],file=>this.ui.restore(folder,file));return}
    if(!['ok','legacy'].includes(result.status)){this.ui.error('add',result.message ?? (result.status==='missing'?'该目录没有可恢复的布局文件':'布局文件不可恢复'));return}
    folder=result.folder ?? folder
    const restored=await resolveProjectDirectory(this.workspace.projects(),result.document,folder)
    if(!current())return
    if(restored.error){this.ui.error('add',restored.error);return}
    const spec=restored.spec
    if(result.status==='legacy'){
      this.store.schedule(folder,layoutSnapshot(spec,result.document.geometry))
      await this.store.flush(folder)
      if(!current())return
      if(this.store.state(folder).status!=='saved'){this.ui.error('add','旧布局尚未迁移成功，请重试');return}
    }
    if(!current())return
    this.workspace.commit(p=>({...p,nameOverrides:{...p.nameOverrides,[spec.id]:result.document.project.name},layouts:p.layouts.some(l=>l.id===spec.id)?p.layouts.map(l=>l.id===spec.id?spec:l):[...p.layouts,spec],folders:{...p.folders,[spec.id]:folder}}))
    this.ui.restored(spec)
  }
}
