import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const root=value('--plugin-root')
if(!root||!path.isAbsolute(root))throw Error('EXPLICIT_PLUGIN_ROOT_REQUIRED')
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex')
const manifest=JSON.parse(await fs.readFile(path.join(root,'materials/manifests/migration.json'),'utf8'))
const totals={}
for(const row of manifest.files){
 const total=totals[row.disposition]??={count:0,bytes:0,verified:0};total.count++;total.bytes+=row.bytes
 if(!row.newPath)continue
 if(!row.verified)throw Error('COPY_NOT_VERIFIED')
 for(const file of [row.oldPath,row.newPath]){
  const stat=await fs.lstat(file)
  if(!stat.isFile()||stat.isSymbolicLink()||await hash(file)!==row.sha256)throw Error('COPIED_FILE_CHANGED')
 }
 total.verified++
}
const sourceSnapshots=JSON.parse(await fs.readFile(path.join(root,'materials/manifests/source-home.json'),'utf8'))
for(const row of sourceSnapshots)for(const file of [row.oldPath,row.newPath])if((await hash(file)).toLowerCase()!==row.sha256.toLowerCase())throw Error('SOURCE_SNAPSHOT_CHANGED')
const retainedLinks=[]
for(const row of manifest.links){if(!(await fs.lstat(row.path)).isSymbolicLink()||await fs.readlink(row.path)!==row.target)throw Error('SOURCE_LINK_CHANGED');retainedLinks.push(row.path)}
const receiptHomes=[]
for(let i=0;i<args.length;i++)if(args[i]==='--receipt-home')receiptHomes.push(args[i+1])
const receipts=[]
for(const home of receiptHomes){
 const directory=path.join(home,'storages'),names=['kaogong_material_import_rc3.json','kaogong_material_plans_rc3.json']
 const captures=[]
 for(const name of names){try{const file=path.join(directory,name),bytes=await fs.readFile(file);captures.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),data:JSON.parse(bytes)})}catch(e){if(e.code!=='ENOENT')throw e}}
 const journals=captures.find(row=>row.file.endsWith(names[0]))?.data.tables?.journals??{}
 const plans=captures.find(row=>row.file.endsWith(names[1]))?.data.tables?.plans??{}
 const rows=Object.values(journals).map(journal=>{const stored=plans[journal.planId];if(!stored||stored.fingerprint!==journal.planFingerprint)throw Error('RECEIPT_PLAN_MISMATCH');const plan=stored.plan;return {id:journal.id,status:journal.status,instanceId:journal.instanceId,planId:journal.planId,planFingerprint:journal.planFingerprint,sourceHome:plan.source?.home,roots:{materials:plan.assetEvidence?.materials?.materialRoot,bank:plan.assetEvidence?.bank?.questionImageRoot,mineru:plan.assetEvidence?.bank?.documentRoot?.mineruRoot,private:plan.assetEvidence?.private?.materialRoot}}})
 for(const row of captures)if(await hash(row.file)!==row.sha256)throw Error('RUNTIME_RECEIPT_CHANGED_DURING_AUDIT')
 receipts.push({home,files:captures.map(({file,sha256})=>({file,sha256})),rows})
}
const result={generatedAt:new Date().toISOString(),mode:'readonly-verified-copy-audit',totals,sourceSnapshots:sourceSnapshots.map(({oldPath,newPath,sha256})=>({oldPath,newPath,sha256})),retainedLinkCount:retainedLinks.length,retainedLinks,receipts,sourceMutated:false,runtimeMutated:false}
const output=value('--output')
if(output){if(!path.isAbsolute(output))throw Error('ABSOLUTE_OUTPUT_REQUIRED');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2))}
console.log(JSON.stringify({totals,retainedLinkCount:retainedLinks.length,receiptHomes:receipts.map(row=>({home:row.home,receipts:row.rows.length,applied:row.rows.filter(x=>x.status==='applied').length,otherStatuses:row.rows.filter(x=>x.status!=='applied').map(x=>x.status)})),sourceMutated:false,runtimeMutated:false}))
