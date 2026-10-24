/** Exact original private references only. This is neither PDF provenance nor a sharing grant. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {parseLegacyDocumentReference,resolveLegacyDocumentPath} from './legacy-document-paths.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const canonical=x=>JSON.stringify(x,function(_k,v){return object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v})
const digest=x=>sha(canonical(x))
const inside=(root,target)=>{const rel=path.relative(root,target);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))}
const fail=code=>{throw Object.assign(new Error(code),{code})}
const jobPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function relative(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$|[:%\x00-\x1f]/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('UNSAFE_PRIVATE_ASSET_PATH')
 return value
}
function absolute(value){if(typeof value!=='string'||!path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))fail('UNSAFE_PRIVATE_ASSET_PATH');return path.resolve(value)}
async function rootFacts(root,io){
 const requestedMaterialRoot=absolute(root)
 try{const materialRoot=await io.realpath(requestedMaterialRoot),stat=await io.stat(materialRoot);if(!stat.isDirectory())fail('PRIVATE_ASSET_ROOT_UNAVAILABLE');return {requestedMaterialRoot,materialRoot,rootIdentity:`${stat.dev}:${stat.ino}`}}catch{fail('PRIVATE_ASSET_ROOT_UNAVAILABLE')}
}
async function file(root,relativePath,io){
 relative(relativePath);const target=path.resolve(root,relativePath)
 if(!inside(root,target))fail('UNSAFE_PRIVATE_ASSET_PATH')
 try{
  const scoped=relativePath.match(new RegExp('^storage/mineru/([0-9a-f-]+)/(job[.]json|assets/(.+))$'))
  const resolvedPath=scoped?(await resolveLegacyDocumentPath({root:path.join(root,'storage/mineru'),jobId:scoped[1],kind:scoped[2]==='job.json'?'job':'asset',asset:scoped[3],io})).resolvedPath:await io.realpath(target);if(!inside(root,resolvedPath))fail('UNSAFE_PRIVATE_ASSET_PATH')
  if(!(await io.stat(resolvedPath)).isFile())fail('PRIVATE_ASSET_FILE_UNAVAILABLE')
  const bytes=await io.readFile(resolvedPath)
  if(await io.realpath(target)!==resolvedPath)fail('PRIVATE_ASSET_SOURCE_CHANGED')
  return {bytes,receipt:{relativePath,resolvedPath,sha256:sha(bytes)}}
 }catch(e){if(['UNSAFE_PRIVATE_ASSET_PATH','PRIVATE_ASSET_SOURCE_CHANGED'].includes(e.code))throw e;fail('PRIVATE_ASSET_FILE_UNAVAILABLE')}
}
function json(bytes){try{return JSON.parse(bytes.toString('utf8'))}catch{fail('PRIVATE_ASSET_FORMAT_UNSUPPORTED')}}
function records(snapshot){
 if(!object(snapshot)||snapshot.format!=='kaogong-legacy-inspection'||snapshot.formatVersion!==1||snapshot.private!==true||!Array.isArray(snapshot.files))fail('INVALID_INSPECTION_SNAPSHOT')
 const names=new Set()
 for(const f of snapshot.files){if(!object(f)||typeof f.name!=='string'||names.has(f.name)||typeof f.bytesBase64!=='string'||sha(Buffer.from(f.bytesBase64,'base64'))!==f.sha256)fail('INVALID_INSPECTION_SNAPSHOT');names.add(f.name)}
 if(sha(JSON.stringify(snapshot.files.map(({name,sha256,resolvedPath})=>[name,sha256,resolvedPath])))!==snapshot.sourceRevision)fail('INVALID_INSPECTION_SNAPSHOT')
 const f=snapshot.files.find(f=>f.name==='kaogong_knowledge');if(!f)fail('INVALID_INSPECTION_SNAPSHOT')
 const d=json(Buffer.from(f.bytesBase64,'base64'));if(d.unit?.name!=='kaogong_knowledge'||d.unit.version!==1||!object(d.tables?.entries))fail('INVALID_INSPECTION_SNAPSHOT')
 return d.tables.entries
}
function htmlSource(tag){
 const text=tag.slice(4,-1),attributes=[],pattern=/\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy
 let cursor=0
 while(cursor<text.length){
  if(/^\s*\/?\s*$/.test(text.slice(cursor)))break
  pattern.lastIndex=cursor;const match=pattern.exec(text)
  if(!match)return null
  attributes.push({name:match[1].toLowerCase(),value:match[2]??match[3]??match[4]});cursor=pattern.lastIndex
 }
 const sources=attributes.filter(x=>x.name==='src')
 return sources.length===1&&!attributes.some(x=>x.name==='srcset')?sources[0].value:null
}
function references(content,jobId){
 const refs=[]
 for(const [,src]of content.matchAll(/!\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g))refs.push({kind:'markdown',src})
 for(const [tag]of content.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)){
  const src=htmlSource(tag)
  if(typeof src==='string')refs.push({kind:'html',src})
 }
 return refs.map(ref=>{
  let asset
  const decoded=ref.src.replace(/&amp;/g,'&')
  if(decoded.startsWith('/api/kaogong/document-image?')){
   const parsed=parseLegacyDocumentReference(decoded)
   if(!parsed||parsed.jobId!==jobId)fail('UNSUPPORTED_PRIVATE_REFERENCE')
   asset=parsed.asset
  }else{if(!decoded.startsWith('images/'))fail('UNSUPPORTED_PRIVATE_REFERENCE');asset=relative(decoded)}
  if(!/\.(png|jpe?g|webp|gif)$/i.test(asset))fail('UNSUPPORTED_PRIVATE_REFERENCE')
  return {...ref,asset}
 })
}
function body(e){const {evidenceHash,...rest}=e;return rest}
function validate(e){if(!object(e)||e.format!=='kaogong-legacy-private-assets'||e.formatVersion!==1||e.provenance!=='legacy-private-reference'||!Array.isArray(e.entries)||!Array.isArray(e.privateEntryIds)||!Array.isArray(e.files)||!Array.isArray(e.sourceAliases)||digest(body(e))!==e.evidenceHash)fail('INVALID_PRIVATE_ASSET_EVIDENCE')}
async function verify(e,io,selected){
 validate(e);const facts=await rootFacts(e.requestedMaterialRoot,io)
 if(facts.materialRoot!==e.materialRoot||facts.rootIdentity!==e.rootIdentity)fail('PRIVATE_ASSET_EVIDENCE_CHANGED')
 for(const alias of e.sourceAliases){let resolved;try{resolved=await io.realpath(absolute(alias.declaredPath))}catch{fail('PRIVATE_ASSET_EVIDENCE_CHANGED')};if(!inside(e.materialRoot,resolved)||resolved!==alias.resolvedPath)fail('PRIVATE_ASSET_EVIDENCE_CHANGED')}
 const pinned=selected?e.files.filter(x=>selected.has(x.relativePath)):e.files
 if(selected&&pinned.length!==selected.size)fail('INVALID_PRIVATE_ASSET_EVIDENCE')
 for(const expected of pinned){let actual;try{actual=(await file(e.materialRoot,expected.relativePath,io)).receipt}catch{fail('PRIVATE_ASSET_EVIDENCE_CHANGED')};if(canonical(actual)!==canonical(expected))fail('PRIVATE_ASSET_EVIDENCE_CHANGED')}
 if(canonical(await rootFacts(e.requestedMaterialRoot,io))!==canonical(facts))fail('PRIVATE_ASSET_EVIDENCE_CHANGED')
}
/** Caller supplies only the trusted plan's original private IDs; no source/PDF classification is changed. */
export async function inspectLegacyPrivateAssets({snapshot,materialRoot,privateEntryIds,io=fs}={}){
 const all=records(snapshot)
 if(!Array.isArray(privateEntryIds)||privateEntryIds.some(id=>typeof id!=='string'||!Object.hasOwn(all,id))||new Set(privateEntryIds).size!==privateEntryIds.length)fail('INVALID_PRIVATE_ENTRY_SELECTION')
 const facts=await rootFacts(materialRoot,io),files=new Map(),aliases=new Map()
 const read=async p=>{const result=await file(facts.materialRoot,p,io),prior=files.get(p);if(prior&&canonical(prior)!==canonical(result.receipt))fail('PRIVATE_ASSET_SOURCE_CHANGED');files.set(p,result.receipt);return result.bytes}
 const manifestRelativePath='storage/mineru/rebuild-manifest.json',manifest=json(await read(manifestRelativePath))
 if(manifest.version!==1||!Array.isArray(manifest.documents))fail('PRIVATE_ASSET_FORMAT_UNSUPPORTED')
 const entries=[],unprovenEntries=[]
 for(const id of [...privateEntryIds].sort()){
  try{
   const record=all[id]
   if(!object(record)||typeof record.content!=='string'||!Array.isArray(record.tags))fail('PRIVATE_RECORD_UNSUPPORTED')
   const tags=record.tags.filter(t=>typeof t==='string'&&t.startsWith('mineru-job:'))
   if(tags.length!==1||!jobPattern.test(tags[0].slice(11)))fail('PRIVATE_JOB_UNPROVEN')
   const jobId=tags[0].slice(11),matches=[]
   for(const doc of manifest.documents){if(!object(doc)||!Array.isArray(doc.jobs))fail('PRIVATE_ASSET_FORMAT_UNSUPPORTED');for(const job of doc.jobs)if(job?.id===jobId)matches.push({doc,job})}
   if(matches.length!==1)fail('PRIVATE_JOB_UNPROVEN')
   const {doc,job}=matches[0]
   if(job.state!=='done'||!/^\d+-\d+$/.test(job.pages)||id!==`mineru_${doc.fingerprint}_${job.pages}`||!/^[a-f0-9]{64}$/.test(doc.fingerprint))fail('PRIVATE_JOB_UNPROVEN')
   const refs=references(record.content,jobId);if(!refs.length)fail('NO_SUPPORTED_PRIVATE_REFERENCE')
   const declaredPath=absolute(doc.file);let resolvedPath;try{resolvedPath=await io.realpath(declaredPath)}catch{fail('PRIVATE_JOB_UNPROVEN')}
   if(!inside(facts.materialRoot,resolvedPath))fail('UNSAFE_PRIVATE_ASSET_PATH')
   const alias={declaredPath,resolvedPath};if(aliases.has(declaredPath)&&canonical(aliases.get(declaredPath))!==canonical(alias))fail('PRIVATE_ASSET_SOURCE_CHANGED');aliases.set(declaredPath,alias)
   const jobRelativePath=`storage/mineru/${jobId}/job.json`,stored=json(await read(jobRelativePath))
   if(stored.id!==jobId||stored.source!==doc.file||stored.pages!==job.pages)fail('PRIVATE_JOB_UNPROVEN')
   const bindings=[]
   for(const ref of refs){
    const relativePath=`storage/mineru/${jobId}/assets/${ref.asset}`,bytes=await read(relativePath)
    const binding={...ref,relativePath,sha256:sha(bytes),bindingKey:digest([id,jobId,ref.kind,ref.src,ref.asset])}
    if(!bindings.some(x=>x.bindingKey===binding.bindingKey))bindings.push(binding)
   }
   entries.push({id,jobId,provenance:'legacy-private-reference',recordSha256:digest(record),contentSha256:sha(record.content),jobRelativePath,bindings})
  }catch(e){if(e.code==='PRIVATE_ASSET_SOURCE_CHANGED')throw e;unprovenEntries.push({id,reason:e.code??'PRIVATE_REFERENCE_UNPROVEN'})}
 }
 const result={format:'kaogong-legacy-private-assets',formatVersion:1,provenance:'legacy-private-reference',...facts,sourceRevision:snapshot.sourceRevision,snapshotHash:digest(snapshot),privateEntryIds:[...privateEntryIds].sort(),manifestRelativePath,entries,unprovenEntries,sourceAliases:[...aliases.values()].sort((a,b)=>a.declaredPath.localeCompare(b.declaredPath)),files:[...files.values()].sort((a,b)=>a.relativePath.localeCompare(b.relativePath))}
 const evidence={...result,evidenceHash:digest(result)};await verify(evidence,io)
 return {evidence,summary:{formatVersion:1,status:'readonly-private-reference-evidence',provenance:'legacy-private-reference',counts:{selected:privateEntryIds.length,provenEntries:entries.length,unprovenEntries:unprovenEntries.length,bindings:entries.reduce((n,x)=>n+x.bindings.length,0),assets:new Set(entries.flatMap(x=>x.bindings.map(b=>b.relativePath))).size},evidenceHash:evidence.evidenceHash}}
}
/** Recompute from a fresh trusted09a snapshot before any separately approved migration. */
export async function revalidateLegacyPrivateAssets({snapshot,materialRoot,privateEntryIds,evidence,io=fs}={}){
 await verify(evidence,io)
 const next=await inspectLegacyPrivateAssets({snapshot,materialRoot,privateEntryIds,io})
 if(next.evidence.evidenceHash!==evidence.evidenceHash)fail('PRIVATE_ASSET_EVIDENCE_CHANGED')
 return next.evidence
}
/** Host must authorize the own private historical instance first; this function never accepts sharing grants. */
export async function readLegacyPrivateAsset({evidence,entryId,jobId,asset,bindingKey,currentRecord,access,io=fs}={}){
 if(access?.kind!=='private-history'||typeof access.ownerInstanceId!=='string'||!access.ownerInstanceId||access.instanceId!==access.ownerInstanceId)fail('PRIVATE_ASSET_ACCESS_DENIED')
 validate(evidence)
 const entry=evidence.entries.find(x=>x.id===entryId&&x.jobId===jobId)
 if(!entry||!object(currentRecord)||digest(currentRecord)!==entry.recordSha256||typeof currentRecord.content!=='string'||sha(currentRecord.content)!==entry.contentSha256)fail('PRIVATE_ASSET_RECORD_CHANGED')
 const matches=entry.bindings.filter(x=>x.asset===asset&&(bindingKey===undefined||x.bindingKey===bindingKey))
 if(matches.length!==1)fail('PRIVATE_ASSET_NOT_PROVEN')
 const allowed=matches[0]
 await verify(evidence,io,new Set([evidence.manifestRelativePath,entry.jobRelativePath,allowed.relativePath]))
 const result=await file(evidence.materialRoot,allowed.relativePath,io)
 if(result.receipt.sha256!==allowed.sha256)fail('PRIVATE_ASSET_EVIDENCE_CHANGED')
 return result.bytes
}
