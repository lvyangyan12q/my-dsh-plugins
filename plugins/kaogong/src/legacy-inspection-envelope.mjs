import {createHash} from 'node:crypto'
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const fail=()=>{throw Object.assign(new Error('INVALID_INSPECTION_SNAPSHOT'),{code:'INVALID_INSPECTION_SNAPSHOT'})}
/** Strict shared envelope; domain name/version/table policy stays with the caller. */
export function inspectionTable(snapshot,name,parse=bytes=>JSON.parse(bytes.toString('utf8'))){
 if(!object(snapshot)||snapshot.format!=='kaogong-legacy-inspection'||snapshot.formatVersion!==1||snapshot.private!==true||!Array.isArray(snapshot.files))fail()
 const names=new Set()
 for(const file of snapshot.files){
  if(!object(file)||typeof file.name!=='string'||names.has(file.name)||typeof file.bytesBase64!=='string')fail()
  const bytes=Buffer.from(file.bytesBase64,'base64')
  if(bytes.toString('base64')!==file.bytesBase64||sha(bytes)!==file.sha256)fail()
  names.add(file.name)
 }
 if(sha(JSON.stringify(snapshot.files.map(({name,sha256,resolvedPath})=>[name,sha256,resolvedPath])))!==snapshot.sourceRevision)fail()
 const file=snapshot.files.find(row=>row.name===name);if(!file)fail()
 return {data:parse(Buffer.from(file.bytesBase64,'base64')),file}
}
