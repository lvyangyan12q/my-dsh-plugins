import {mkdir,realpath,open,rename,unlink,lstat,stat,readdir} from 'node:fs/promises'
import {isAbsolute,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {validateLayout,validateDocument} from './layout-schema.mjs'

const MAX_BYTES=1024*1024
class LayoutError extends Error {constructor(status,message){super(message);this.status=status}}
const failure=error=>({status:error instanceof LayoutError?error.status:'error',message:error instanceof LayoutError?error.message:'项目布局读写失败；原文件保留，请重试。'})
async function projectFolder(folder){if(typeof folder!=='string'||!isAbsolute(folder))throw new LayoutError('invalid','请选择绝对路径的项目目录。');folder=await realpath(folder);if(!(await stat(folder)).isDirectory())throw new LayoutError('invalid','请选择已存在的项目目录。');return folder}
async function layoutDirectory(folder,create=false){
  const dir=join(folder,'.dsh-worktable');if(create)await mkdir(dir,{recursive:true})
  try{const info=await lstat(dir);if(!info.isDirectory()||info.isSymbolicLink())throw new LayoutError('invalid','布局目录不是项目内的普通目录。')}
  catch(error){if(error.code==='ENOENT'&&!create)return null;throw error}
  return dir
}
async function readJson(file){
  let handle
  try{
    const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new LayoutError('invalid','布局目标不是普通文件，原文件保留。')
    handle=await open(file,'r');const size=(await handle.stat()).size
    if(size>MAX_BYTES)throw new LayoutError('invalid','布局文件过大，原文件保留。')
    // Read at most one byte beyond the budget even if an external editor grows the file.
    const raw=Buffer.alloc(MAX_BYTES+1);let offset=0
    while(offset<raw.length){const {bytesRead}=await handle.read(raw,offset,raw.length-offset,null);if(!bytesRead)break;offset+=bytesRead}
    if(offset>MAX_BYTES)throw new LayoutError('invalid','布局文件过大，原文件保留。')
    try{return JSON.parse(raw.subarray(0,offset).toString('utf8').replace(/^\uFEFF/,''))}catch{throw new LayoutError('invalid','布局文件损坏，原文件保留。')}
  }finally{await handle?.close()}
}
async function loadMain(folder){
  if(!await layoutDirectory(folder))return null
  let value;try{value=await readJson(join(folder,'.dsh-worktable','layout.json'))}catch(error){if(error.code==='ENOENT')return null;throw error}
  if(value?.version!==2)throw new LayoutError('unsupported','布局文件版本不兼容，原文件保留。')
  try{return validateDocument(value)}catch{throw new LayoutError('invalid','布局文件结构无效，原文件保留。')}
}
async function locked(folder,run){
  const dir=await layoutDirectory(folder,true)
  const lockPath=join(dir,'layout.lock');let lock
  for(let attempt=0;!lock;attempt++){
    try{lock=await open(lockPath,'wx')}catch(error){if(error.code!=='EEXIST')throw error;if(attempt>=100)throw new LayoutError('error','布局正由其他进程保存或保留了未完成的锁；请稍后重试。');await new Promise(resolve=>setTimeout(resolve,20))}
  }
  try{await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));return await run(dir)}
  finally{await lock.close();await unlink(lockPath)}
}

const legacyName=name=>typeof name==='string'&&/^layout-(?!backup-)[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.json$/.test(name)
function legacyDocument(value){
  if(value?.version!==1)throw new LayoutError('unsupported','旧布局文件版本不兼容，原文件保留。')
  const spec=value.spec
  if(!spec||typeof value.projectId!=='string'||value.projectId!==spec.id)throw new LayoutError('invalid','旧布局项目身份不一致，原文件保留。')
  const widths=panes=>Object.fromEntries((panes??[]).map(p=>[p.id,p.min]))
  let layout
  try{layout=validateLayout({project:{id:spec.id,name:spec.title},spec,geometry:{chatW:spec.chatWidth?.default,topH:spec.topHeight?.default??200,leftW:spec.leftWidth?.default??260,paneWs:widths(spec.main),topWs:widths(spec.top),leftWs:widths(spec.left?[spec.left,...(spec.leftMore??[])]:[])}})}
  catch{throw new LayoutError('invalid','旧布局结构无效，原文件保留。')}
  return {version:2,revision:0,savedAt:typeof value.savedAt==='string'&&Number.isFinite(Date.parse(value.savedAt))?value.savedAt:new Date(0).toISOString(),...layout}
}
export async function readProjectLayout(folder,{projectId,legacyFile}={}){
  try{
    folder=await projectFolder(folder)
    if(legacyFile!==undefined&&!legacyName(legacyFile))throw new LayoutError('invalid','请选择有效的旧布局文件。')
    const document=await loadMain(folder);if(document)return {status:'ok',document,folder}
    const dir=await layoutDirectory(folder);if(!dir)return {status:'missing',folder}
    const candidates=(await readdir(dir)).filter(legacyName).sort()
    let selected
    if(legacyFile!==undefined){if(!candidates.includes(legacyFile))throw new LayoutError('invalid','选择的旧布局文件已不存在。');selected=legacyFile}
    else if(projectId!==undefined){
      if(typeof projectId!=='string')throw new LayoutError('invalid','项目身份无效。')
      selected=candidates.find(name=>name==='layout-'+projectId+'.json')
      if(!selected&&candidates.length)return {status:'ambiguous',folder,candidates,message:'目录中的旧布局属于其他登记，请明确选择恢复对象。'}
    }
    else if(candidates.length>1)return {status:'ambiguous',folder,candidates,message:'发现多份旧布局，请明确选择恢复对象。'}
    else selected=candidates[0]
    if(!selected)return {status:'missing',folder}
    const converted=legacyDocument(await readJson(join(dir,selected)))
    if(legacyFile===undefined&&projectId!==undefined&&converted.project.id!==projectId)throw new LayoutError('invalid','旧布局文件与当前项目身份不一致。')
    return {status:'legacy',folder,legacyFile:selected,document:converted}
  }
  catch(error){return failure(error)}
}

export async function saveProjectLayout(folder,layout,expectedRevision){
  try{
    try{layout=validateLayout(layout)}catch{throw new LayoutError('invalid','布局结构、身份、内容引用或尺寸无效。')}
    if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw new LayoutError('invalid','保存需要明确的预期布局修订。')
    folder=await projectFolder(folder)
    return await locked(folder,async dir=>{
      const current=await loadMain(folder)
      if((current?.revision??null)!==expectedRevision)throw new LayoutError('conflict','布局已经被其他写入方更新，请重新加载后重试。')
      if(current&&current.project.id!==layout.project.id)throw new LayoutError('conflict','项目目录已属于另一个项目，不能覆盖其布局。')
      if(current?.revision===Number.MAX_SAFE_INTEGER)throw new LayoutError('invalid','布局修订已达到安全上限，原文件保留。')
      const document={version:2,revision:(current?.revision??0)+1,savedAt:new Date().toISOString(),...layout}
      const bytes=JSON.stringify(document,null,2)
      if(Buffer.byteLength(bytes)>MAX_BYTES)throw new LayoutError('invalid','布局内容过大。')
      const temp=join(dir,'layout.tmp-'+randomUUID());let handle
      try{handle=await open(temp,'wx');await handle.writeFile(bytes,'utf8');await handle.sync();await handle.close();handle=null;await rename(temp,join(dir,'layout.json'))}
      finally{await handle?.close();await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error})}
      return {status:'ok',document,folder}
    })
  }catch(error){return failure(error)}
}
