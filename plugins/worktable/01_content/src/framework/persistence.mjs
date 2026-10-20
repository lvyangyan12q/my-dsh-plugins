import {mkdir,open,readFile,rename,unlink,rmdir,realpath,lstat} from 'node:fs/promises'
import {dirname,basename,join,resolve} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
export class PersistenceError extends Error{constructor(code,message){super(message);this.code=code;this.status=code==='owner-conflict'?409:503}}
const failure=(code,message)=>new PersistenceError(code,message)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const alive=pid=>{try{process.kill(pid,0);return true}catch(error){if(error.code==='ESRCH')return false;throw failure('owner-unavailable','无法验证存储所有者，原文件保留；请先检查已有Host。')}}
async function lockRecord(path){const info=await lstat(path);const value=JSON.parse(await readFile(info.isDirectory()?join(path,'owner.json'):path,'utf8'));if(!Number.isSafeInteger(value.pid)||value.pid<1||info.isDirectory()&&(value.schema!==1||typeof value.token!=='string'))throw failure('owner-unavailable','锁记录无法验证，原文件保留；请检查锁并确认已有Host已关闭。');return {value,directory:info.isDirectory()}}
async function createLock(path,record){await mkdir(path);let handle;try{handle=await open(join(path,'owner.json'),'wx');await handle.writeFile(JSON.stringify(record));await handle.sync();await handle.close();handle=null}catch(error){await handle?.close().catch(()=>{});await unlink(join(path,'owner.json')).catch(()=>{});await rmdir(path).catch(()=>{});throw error}}
async function releaseLock(path,record){const current=await lockRecord(path).catch(error=>{if(error.code==='ENOENT')return null;throw error});if(!current)return;if(!current.directory||current.value.token!==record.token)throw failure('owner-lost','存储锁已属于另一代所有者，拒绝删除或继续写入。');const released=path+'.released-'+record.token;try{await rename(path,released)}catch{throw failure('owner-release-failed','所有者释放失败，锁记录保留；请检查存储后重新启动。')}await unlink(join(released,'owner.json')).catch(()=>{});await rmdir(released).catch(()=>{})}
export class FileOwner{
 static async acquire(file){
  await mkdir(dirname(file),{recursive:true});let canonical;
  try{canonical=await realpath(file)}catch(error){if(error.code!=='ENOENT')throw error;const info=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e});if(info?.isSymbolicLink())throw failure('storage-unavailable','存储路径链接不可解析，请恢复原文件。');canonical=join(await realpath(dirname(file)),basename(file))}
  const lock=canonical+'.lock',record={schema:1,pid:process.pid,token:randomUUID()};
  for(let attempt=0;attempt<3;attempt++){
   try{await createLock(lock,record);return new FileOwner(canonical,lock,record)}catch(error){if(error.code!=='EEXIST')throw error}
   let old;try{old=await lockRecord(lock)}catch(error){if(error.code==='ENOENT')continue;throw failure('owner-unavailable','锁记录不可验证，原文件保留；请确认旧Host已关闭后恢复有效锁。')}
   if(alive(old.value.pid))throw failure('owner-conflict','此持久路径已有Host所有者，请先关闭另一个Host。');
   const recovery=lock+'.recovery',recoveryRecord={schema:1,pid:process.pid,token:randomUUID()};
   try{await createLock(recovery,recoveryRecord)}catch(error){if(error.code==='EEXIST')throw failure('owner-recovery-blocked','另一恢复操作持有回收门闩，请核对后重试；不会删除它的锁。');throw error}
   try{
    const current=await lockRecord(lock).catch(error=>{if(error.code==='ENOENT')return null;throw error});
    if(current&&alive(current.value.pid))throw failure('owner-conflict','此持久路径已有Host所有者，请先关闭另一个Host。');
    if(current)await rename(lock,lock+'.stale-'+randomUUID());
   }finally{await releaseLock(recovery,recoveryRecord)}
  }
  throw failure('owner-conflict','存储所有权正在变化，请检查已有Host并重试。');
 }
 constructor(file,lock,record){Object.assign(this,{file,lock,record});this.closed=false;this.closePromise=null}
 async assert(){if(this.closed)throw failure('unavailable','存储所有者已关闭。');const current=await lockRecord(this.lock);if(!current.directory||current.value.token!==this.record.token)throw failure('owner-lost','存储锁已更新，已拒绝旧所有者写入。')}
 close(){if(!this.closePromise){this.closed=true;this.closePromise=releaseLock(this.lock,this.record)}return this.closePromise}
}
/** One canonical file owner; failed/future input never becomes an empty replacement. */
export class ProfileFileStore{
 constructor(file,initial,validate,schemas=[1]){Object.assign(this,{file,initial,validate,schemas});this.owner=null;this.readyPromise=null;this.closed=false;this.closePromise=null;this.versions=new WeakMap()}
 async ready(){if(this.closed)throw failure('unavailable','状态所有者已关闭，请重新打开应用。');if(!this.readyPromise){const pending=this.initialize();this.readyPromise=pending;pending.catch(()=>{if(this.readyPromise===pending)this.readyPromise=null})}return this.readyPromise}
 async initialize(){let owner;try{
  owner=await FileOwner.acquire(this.file);this.owner=owner;this.file=owner.file;
  const marker=this.file+'.initialized';let marked=false;try{const value=JSON.parse(await readFile(marker,'utf8'));if(value.schema!==1)throw Error();marked=true}catch(error){if(error.code!=='ENOENT')throw failure('storage-invalid','存储初始化标记无效，原状态保留，请恢复有效标记。')}
  try{await this.load()}catch(error){if(error.code!=='state-absent')throw error;if(marked)throw failure('storage-missing','已初始化的状态文件缺失；不会创建空实例，请恢复原文件后重试。');await this.atomic(this.initial())}
  if(!marked)await this.publishMarker(marker)
 }catch(error){await owner?.close().catch(()=>{});if(this.owner===owner)this.owner=null;if(error instanceof PersistenceError)throw error;throw failure('storage-unavailable','状态无法读取或建立所有权，原文件保留，请检查存储后重试。')}}
 async publishMarker(marker){const temporary=marker+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temporary,'wx');await handle.writeFile(JSON.stringify({schema:1}));await handle.sync();await handle.close();handle=null;await this.owner.assert();await rename(temporary,marker);if(process.platform!=='win32'){const directory=await open(dirname(marker),'r');try{await directory.sync()}finally{await directory.close()}}}finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(()=>{})}}
 async load(){let bytes;try{bytes=await readFile(this.file)}catch(error){if(error.code==='ENOENT')throw failure('state-absent','状态文件缺失。');throw failure('storage-unavailable','状态无法读取，原记录保留。')}
  let data;try{data=JSON.parse(bytes.toString('utf8'))}catch{throw failure('storage-invalid','状态内容损坏，原文件保留；请恢复有效副本后重试。')}
  if(!this.schemas.includes(data?.schema))throw failure('schema-incompatible','状态版本不受支持，已停止相关写入并保留原文件。');
  try{this.validate(data)}catch{throw failure('storage-invalid','状态字段或关联无效，原文件保留；请恢复有效副本后重试。')}
  this.versions.set(data,hash(bytes));return data;
 }
 async read(){await this.ready();await this.owner.assert();try{return await this.load()}catch(error){if(error.code==='state-absent')throw failure('storage-missing','已初始化状态文件缺失，请恢复原文件后重试。');throw error}}
 async write(data){await this.ready();await this.owner.assert();this.validate(data);const expected=this.versions.get(data);const current=await this.load();if(!expected||this.versions.get(current)!==expected)throw failure('storage-conflict','状态已由其他操作更新，请刷新后重试，未覆盖较新记录。');await this.atomic(data)}
 async atomic(data){const temporary=this.file+'.'+randomUUID()+'.tmp';let handle,published=false;const bytes=JSON.stringify(data,null,2);
  try{handle=await open(temporary,'wx');await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await this.owner.assert();await rename(temporary,this.file);published=true;
   if(process.platform!=='win32'){const directory=await open(dirname(this.file),'r');try{await directory.sync()}finally{await directory.close()}}
   this.versions.set(data,hash(bytes));
  }catch(error){if(error instanceof PersistenceError)throw error;throw failure(published?'storage-uncertain':'storage-unavailable',published?'状态发布后耐久结果未确认，请刷新核对；不会自动重放。':'状态未保存，原记录保留，请检查存储后重试。')}
  finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(()=>{})}
 }
 close(){if(!this.closePromise){this.closed=true;this.closePromise=(async()=>{await this.readyPromise?.catch(()=>{});await this.owner?.close()})()}return this.closePromise}
}
