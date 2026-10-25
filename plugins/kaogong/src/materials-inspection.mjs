/** Offline, two-domain capture. No role, practice, lesson, progress or Native service is opened. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const inside=(root,target)=>{const relative=path.relative(root,target);return !path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)}
const fail=code=>{throw Object.assign(Error(code),{code})}
const specs={kaogong_bank:[2,'questions'],kaogong_knowledge:[1,'entries']}
const revision=files=>sha(JSON.stringify(files.map(({name,sha256,resolvedPath})=>[name,sha256,resolvedPath])))
async function capture(root,io){
 const files=[]
 for(const[name,[version,table]]of Object.entries(specs)){
  const sourcePath=path.join(root,'storages',name+'.json')
  let resolvedPath,bytes,data
  try{resolvedPath=await io.realpath(sourcePath);if(!inside(root,resolvedPath))fail('MATERIAL_SOURCE_PATH_ESCAPE');bytes=await io.readFile(resolvedPath);data=JSON.parse(bytes.toString('utf8'))}catch(error){if(error.code==='MATERIAL_SOURCE_PATH_ESCAPE')throw error;fail('MATERIAL_SOURCE_UNAVAILABLE_OR_INVALID')}
  if(data.unit?.name!==name||data.unit?.version!==version||data.global!==null||!object(data.tables)||Object.keys(data.tables).length!==1||!object(data.tables[table])||!Object.values(data.tables[table]).every(object))fail('MATERIAL_SOURCE_FORMAT_UNSUPPORTED')
  files.push({name,sourcePath,resolvedPath,version,table,sha256:sha(bytes),bytesBase64:bytes.toString('base64')})
 }
 return files
}
export async function inspectMaterials({home,io=fs}={}){
 if(typeof home!=='string'||!path.isAbsolute(home))fail('EXPLICIT_MATERIAL_HOME_REQUIRED')
 const sourceHome=await io.realpath(home),files=await capture(sourceHome,io),sourceRevision=revision(files)
 if(revision(await capture(sourceHome,io))!==sourceRevision)fail('MATERIAL_SOURCE_CHANGED')
 const rows=file=>JSON.parse(Buffer.from(file.bytesBase64,'base64').toString('utf8')).tables[file.table]
 const knowledge=Object.values(rows(files[1])),summary={status:'readonly-material-inspection',counts:{bank:Object.keys(rows(files[0])).length,knowledge:knowledge.length,notesRetainedAtSource:knowledge.filter(row=>row.kind==='笔记').length},sourceRevision}
 return {snapshot:{format:'kaogong-material-inspection',formatVersion:1,private:true,sourceHome,sourceRevision,files},summary}
}
/** Existing asset proof readers consume this byte-envelope, without requiring learning/role domains. */
export function materialEvidenceSnapshot(snapshot){
 if(snapshot?.format!=='kaogong-material-inspection'||snapshot.formatVersion!==1||snapshot.private!==true||snapshot.files?.length!==2||snapshot.files[0]?.name!=='kaogong_bank'||snapshot.files[1]?.name!=='kaogong_knowledge'||revision(snapshot.files)!==snapshot.sourceRevision)fail('MATERIAL_SNAPSHOT_INVALID')
 for(const file of snapshot.files){const bytes=Buffer.from(file.bytesBase64,'base64');if(bytes.toString('base64')!==file.bytesBase64||sha(bytes)!==file.sha256)fail('MATERIAL_SNAPSHOT_CHANGED')}
 return {...snapshot,format:'kaogong-legacy-inspection'}
}
