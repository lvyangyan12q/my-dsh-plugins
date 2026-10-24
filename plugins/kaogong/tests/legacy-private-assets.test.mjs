import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {inspectLegacyPrivateAssets,readLegacyPrivateAsset,revalidateLegacyPrivateAssets} from '../src/legacy-private-assets.mjs'
import {readLegacyMaterialAsset} from '../src/legacy-material-evidence.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex')
const jobId='12345678-1234-1234-1234-123456789012'
const specs={kaogong_bank:[2,'questions'],kaogong_knowledge:[1,'entries'],kaogong_lessons:[1,'lessons'],kaogong_notebook:[1,'questions'],kaogong_practice:[1,'rounds'],kaogong_progress:[1,'days'],personal_workbench_role_bindings:[1,'bindings']}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-private-assets-'));t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true})})
 const home=path.join(root,'home'),materialRoot=path.join(root,'materials'),jobRoot=path.join(materialRoot,'storage/mineru',jobId)
 await fs.mkdir(path.join(home,'storages'),{recursive:true});await fs.mkdir(path.join(jobRoot,'assets/images'),{recursive:true})
 const pdf=path.join(materialRoot,'source.pdf');await fs.writeFile(pdf,'%PDF-fixture originally known')
 const fingerprint=hash('old unverified PDF bytes'),id=`mineru_${fingerprint}_1-2`
 const content=`private original\n![one](/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png)\n<img src="images/b.jpg">`
 const record={title:'private edited title',kind:'讲义',content,subject:'subject',knowledgePoint:'private',source:pdf+'#pages=1-2',tags:['MinerU','待校对','mineru-job:'+jobId],createdAt:'2026-01-01',updatedAt:'2026-01-01'}
 const manifest={version:1,documents:[{file:pdf,fingerprint,pages:2,subject:'subject',jobs:[{id:jobId,pages:'1-2',state:'done'}]}]}
 const job={id:jobId,source:pdf,pages:'1-2',title:'source.pdf',subject:'subject'}
 await fs.writeFile(path.join(materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(jobRoot,'job.json'),JSON.stringify(job))
 await fs.writeFile(path.join(jobRoot,'assets/images/a.png'),'private-png');await fs.writeFile(path.join(jobRoot,'assets/images/b.jpg'),'private-jpg')
 for(const [name,[version,table]]of Object.entries(specs))await fs.writeFile(path.join(home,'storages',name+'.json'),JSON.stringify({unit:{name,version},global:null,tables:{[table]:name==='kaogong_knowledge'?{[id]:record}:{}}}))
 const snapshot=(await inspectLegacy({home})).snapshot
 const inspect=()=>inspectLegacyPrivateAssets({snapshot,materialRoot,privateEntryIds:[id]})
 const read=(evidence,extra={})=>readLegacyPrivateAsset({evidence,entryId:id,jobId,asset:'images/a.png',currentRecord:record,access:{kind:'private-history',ownerInstanceId:'history',instanceId:'history'},...extra})
 return {root,home,materialRoot,jobRoot,pdf,id,record,manifest,job,snapshot,inspect,read}
}
function replaceRecord(f,record){
 const file=f.snapshot.files.find(x=>x.name==='kaogong_knowledge'),data=JSON.parse(Buffer.from(file.bytesBase64,'base64'));data.tables.entries[f.id]=record
 const bytes=Buffer.from(JSON.stringify(data));file.bytesBase64=bytes.toString('base64');file.sha256=hash(bytes)
 f.snapshot.sourceRevision=hash(JSON.stringify(f.snapshot.files.map(({name,sha256,resolvedPath})=>[name,sha256,resolvedPath])))
}

test('original private Markdown and HTML images retain exact own-record access without PDF truth or sharing',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.pdf)
 const {evidence,summary}=await f.inspect()
 assert.equal(evidence.provenance,'legacy-private-reference');assert.deepEqual(summary.counts,{selected:1,provenEntries:1,unprovenEntries:0,bindings:2,assets:2})
 assert.equal(evidence.entries[0].id,f.id);assert.equal(evidence.entries[0].bindings.find(x=>x.asset==='images/b.jpg').src,'images/b.jpg')
 assert.equal((await f.read(evidence)).toString(),'private-png')
 assert.equal((await f.read(evidence,{asset:'images/b.jpg'})).toString(),'private-jpg')
 assert.deepEqual(await fs.readFile(f.pdf),before)
 assert.doesNotMatch(JSON.stringify(summary),/subject|source.pdf|private original|12345678|images/)
 assert.equal((await revalidateLegacyPrivateAssets({snapshot:f.snapshot,materialRoot:f.materialRoot,privateEntryIds:[f.id],evidence})).evidenceHash,evidence.evidenceHash)
})

for(const [label,extra,code]of [
 ['missing authorization',{access:undefined},'PRIVATE_ASSET_ACCESS_DENIED'],
 ['foreign instance',{access:{kind:'private-history',ownerInstanceId:'history',instanceId:'other'}},'PRIVATE_ASSET_ACCESS_DENIED'],
 ['shared resource grant',{access:{kind:'shared',ownerInstanceId:'history',instanceId:'history'}},'PRIVATE_ASSET_ACCESS_DENIED'],
 ['new record ID',{entryId:'new-copy'},'PRIVATE_ASSET_RECORD_CHANGED'],
 ['foreign job ID',{jobId:'87654321-1234-1234-1234-123456789012'},'PRIVATE_ASSET_RECORD_CHANGED'],
 ['unreferenced sibling asset',{asset:'images/unreferenced.png'},'PRIVATE_ASSET_NOT_PROVEN'],
])test(label+' cannot borrow private reference proof',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect();await assert.rejects(f.read(evidence,extra),{code})
})
for(const field of ['content','title','tags'])test('changed current '+field+' refuses original record proof',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect(),record=structuredClone(f.record)
 if(field==='tags')record.tags.push('new');else record[field]+='changed'
 await assert.rejects(f.read(evidence,{currentRecord:record}),{code:'PRIVATE_ASSET_RECORD_CHANGED'})
})
test('private and shared evidence formats cannot be interchanged',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect()
 await assert.rejects(readLegacyMaterialAsset({evidence,entryId:f.id,asset:'images/a.png'}),{code:'INVALID_MATERIAL_EVIDENCE'})
 await assert.rejects(f.read({...evidence,format:'kaogong-legacy-material-evidence'}),{code:'INVALID_PRIVATE_ASSET_EVIDENCE'})
 const altered=structuredClone(evidence);altered.entries[0].bindings[0].sha256='0'.repeat(64)
 await assert.rejects(f.read(altered),{code:'INVALID_PRIVATE_ASSET_EVIDENCE'})
})
test('ambiguous aliases require the exact stored binding key',async t=>{
 const f=await fixture(t);f.record.content+='\n<img src="images/a.png">';replaceRecord(f,f.record)
 const {evidence}=await f.inspect();await assert.rejects(f.read(evidence),{code:'PRIVATE_ASSET_NOT_PROVEN'})
 const binding=evidence.entries[0].bindings.find(x=>x.src==='images/a.png')
 assert.equal((await f.read(evidence,{bindingKey:binding.bindingKey})).toString(),'private-png')
})
for(const [label,src]of [
 ['parent traversal',`/api/kaogong/document-image?id=${jobId}&asset=..%2Foutside.png`],
 ['double encoded traversal',`/api/kaogong/document-image?id=${jobId}&asset=%252e%252e%252Foutside.png`],
 ['relative traversal','images/../outside.png'],
 ['absolute file','file:///outside.png'],
 ['remote reference','https://example.invalid/a.png'],
 ['foreign job','/api/kaogong/document-image?id=87654321-1234-1234-1234-123456789012&asset=images%2Fa.png'],
 ['extra query',`/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png&root=outside`],
])test(label+' is not a private asset permission',async t=>{
 const f=await fixture(t);f.record.content=`![private](${src})`;replaceRecord(f,f.record)
 const {evidence}=await f.inspect();assert.equal(evidence.entries.length,0)
})
for(const [label,change]of [
 ['asset bytes',f=>fs.writeFile(path.join(f.jobRoot,'assets/images/a.png'),'tampered')],
 ['job metadata',f=>fs.writeFile(path.join(f.jobRoot,'job.json'),JSON.stringify({...f.job,pages:'1-1'}))],
 ['manifest bytes',f=>fs.writeFile(path.join(f.materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify({...f.manifest,changed:true}))],
])test(label+' changes invalidate a pinned private read',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect();await change(f)
 await assert.rejects(f.read(evidence),{code:'PRIVATE_ASSET_EVIDENCE_CHANGED'})
})
test('fresh snapshot changes invalidate revalidation; unknown IDs and tampered snapshot bytes fail before access',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect()
 await assert.rejects(inspectLegacyPrivateAssets({snapshot:f.snapshot,materialRoot:f.materialRoot,privateEntryIds:['new']}),{code:'INVALID_PRIVATE_ENTRY_SELECTION'})
 f.record.content+='new';replaceRecord(f,f.record)
 await assert.rejects(revalidateLegacyPrivateAssets({snapshot:f.snapshot,materialRoot:f.materialRoot,privateEntryIds:[f.id],evidence}),{code:'PRIVATE_ASSET_EVIDENCE_CHANGED'})
 f.snapshot.files[0].sha256='0'.repeat(64)
 await assert.rejects(f.inspect(),{code:'INVALID_INSPECTION_SNAPSHOT'})
})
test('asset junction escapes are rejected before reading outside the explicit root',async t=>{
 const f=await fixture(t),outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'a.png'),'external');await fs.writeFile(path.join(outside,'b.jpg'),'external')
 await fs.rm(path.join(f.jobRoot,'assets/images'),{recursive:true});await fs.symlink(outside,path.join(f.jobRoot,'assets/images'),process.platform==='win32'?'junction':'dir')
 const reads=[],io={...fs,readFile:async p=>{reads.push(p);return fs.readFile(p)}}
 const {evidence}=await inspectLegacyPrivateAssets({snapshot:f.snapshot,materialRoot:f.materialRoot,privateEntryIds:[f.id],io})
 assert.equal(evidence.entries.length,0);assert.equal(reads.some(x=>x.startsWith(outside)),false)
})

test('cross-job junction inside the material root is not an original job asset',async t=>{
 const f=await fixture(t),other=path.join(f.materialRoot,'storage/mineru/87654321-1234-1234-1234-123456789012/assets/images')
 await fs.mkdir(other,{recursive:true});await fs.writeFile(path.join(other,'a.png'),'other-job');await fs.writeFile(path.join(other,'b.jpg'),'other-job')
 await fs.rm(path.join(f.jobRoot,'assets/images'),{recursive:true});await fs.symlink(other,path.join(f.jobRoot,'assets/images'),process.platform==='win32'?'junction':'dir')
 const {evidence}=await f.inspect();assert.equal(evidence.entries.length,0)
})
import {parseLegacyDocumentReference,resolveLegacyDocumentPath} from '../src/legacy-document-paths.mjs'

test('shared path parser accepts exact local URLs only and resolver reads no bytes',async t=>{
 const f=await fixture(t),target=`/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png`
 assert.deepEqual(parseLegacyDocumentReference(target),{jobId,asset:'images/a.png'})
 for(const invalid of [target+'\n',target+'&id='+jobId,target+'#fragment',target.replace('images%2Fa.png','images%252Fa.png'),target.replace(jobId,'not-a-job')])assert.equal(parseLegacyDocumentReference(invalid),null)
 const result=await resolveLegacyDocumentPath({root:path.join(f.materialRoot,'storage/mineru'),jobId,kind:'asset',asset:'images/a.png',io:{realpath:fs.realpath,stat:fs.stat}})
 assert.equal(result.relativePath,`${jobId}/assets/images/a.png`);assert.equal(result.resolvedPath,await fs.realpath(path.join(f.jobRoot,'assets/images/a.png')))
})

test('private continuity does not claim PDF truth when current PDF bytes change',async t=>{
 const f=await fixture(t),{evidence}=await f.inspect();await fs.writeFile(f.pdf,'%PDF-edited after original private record')
 assert.equal((await f.read(evidence)).toString(),'private-png')
})

test('declared source aliases and material root identity stay pinned',async t=>{
 const f=await fixture(t),alias=path.join(f.root,'original-source-alias')
 await fs.symlink(f.materialRoot,alias,process.platform==='win32'?'junction':'dir')
 const declared=path.join(alias,'source.pdf');f.manifest.documents[0].file=declared;f.job.source=declared
 await fs.writeFile(path.join(f.materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify(f.manifest));await fs.writeFile(path.join(f.jobRoot,'job.json'),JSON.stringify(f.job))
 const {evidence}=await f.inspect();assert.equal(evidence.entries.length,1)
 await fs.unlink(alias);const outside=path.join(f.root,'outside-source');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'source.pdf'),'outside')
 await fs.symlink(outside,alias,process.platform==='win32'?'junction':'dir')
 await assert.rejects(f.read(evidence),{code:'PRIVATE_ASSET_EVIDENCE_CHANGED'})
 await fs.unlink(alias);await fs.symlink(f.materialRoot,alias,process.platform==='win32'?'junction':'dir')
 await fs.rename(f.materialRoot,path.join(f.root,'old-materials'));await fs.mkdir(f.materialRoot)
 await assert.rejects(f.read(evidence),{code:'PRIVATE_ASSET_EVIDENCE_CHANGED'})
})

test('changing bytes during inspection cannot produce a successful private receipt',async t=>{
 const f=await fixture(t);let changed=false
 const io={...fs,readFile:async(p,...args)=>{const b=await fs.readFile(p,...args);if(!changed&&String(p).endsWith('a.png')){changed=true;await fs.writeFile(p,'changed-during-read')}return b}}
 await assert.rejects(inspectLegacyPrivateAssets({snapshot:f.snapshot,materialRoot:f.materialRoot,privateEntryIds:[f.id],io}),{code:'PRIVATE_ASSET_EVIDENCE_CHANGED'})
})

test('HTML attribute text cannot masquerade as an embedded src permission',async t=>{
 const f=await fixture(t);f.record.content='<img data-label=" src=\'images/a.png\'">';replaceRecord(f,f.record)
 assert.equal((await f.inspect()).evidence.entries.length,0)
})
