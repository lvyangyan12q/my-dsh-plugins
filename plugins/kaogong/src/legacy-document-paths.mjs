/** Metadata-only path seam shared by distinct legacy proof owners; no byte reads or grants. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
const job=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const inside=(root,target)=>{const r=path.relative(root,target);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep))}
const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b
const fail=code=>{throw Object.assign(new Error(code),{code})}
function safeAsset(asset){
 if(typeof asset!=='string'||!asset||asset.includes('\\')||!(/\.(png|jpe?g|webp|gif)$/i.test(asset))||asset.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$|[:%\x00-\x1f]/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))fail('LEGACY_DOCUMENT_PATH_UNSAFE')
 return asset
}
/** Parse only an exact local document-image URL; reject duplicate/extra keys and extra decoding. */
export function parseLegacyDocumentReference(target){
 try{
  if(typeof target!=='string'||!target.startsWith('/api/kaogong/document-image?'))return null
  const u=new URL(target,'https://offline.invalid'),jobId=u.searchParams.get('id')
  if(u.pathname!=='/api/kaogong/document-image'||u.hash||[...u.searchParams.keys()].sort().join(',')!=='asset,id'||!job.test(jobId??''))return null
  return {jobId,asset:safeAsset(u.searchParams.get('asset'))}
 }catch{return null}
}
/** root is the explicit MinerU directory. All results remain in this exact job/assets root. */
export async function resolveLegacyDocumentPath({root,jobId,kind,asset,io=fs}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||root.split(/[\\/]/).includes('..')||!job.test(jobId??'')||!['job','asset'].includes(kind))fail('LEGACY_DOCUMENT_PATH_UNSAFE')
 if(kind==='asset')safeAsset(asset)
 const canonicalRoot=await io.realpath(root),expectedJob=path.join(canonicalRoot,jobId),canonicalJob=await io.realpath(expectedJob)
 if(!same(expectedJob,canonicalJob)||!inside(canonicalRoot,canonicalJob))fail('LEGACY_DOCUMENT_PATH_UNSAFE')
 const relativePath=kind==='job'?`${jobId}/job.json`:`${jobId}/assets/${asset}`
 const target=path.resolve(canonicalRoot,relativePath),resolvedPath=await io.realpath(target)
 const bound=kind==='asset'?path.join(canonicalJob,'assets'):canonicalJob
 if(!inside(bound,resolvedPath)||!(await io.stat(resolvedPath)).isFile())fail('LEGACY_DOCUMENT_PATH_UNSAFE')
 if(!same(await io.realpath(expectedJob),canonicalJob)||!same(await io.realpath(target),resolvedPath)||!same(await io.realpath(root),canonicalRoot))fail('LEGACY_DOCUMENT_PATH_CHANGED')
 return {relativePath,resolvedPath}
}
