import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {prepareLegacyAdoption} from '../src/legacy-adoption-plan.ts'
async function fixture(){const home=await mkdtemp(join(tmpdir(),'kaogong-plan-'));await mkdir(join(home,'storages'));const specs={kaogong_bank:[2,'questions'],kaogong_knowledge:[1,'entries'],kaogong_lessons:[1,'lessons'],kaogong_notebook:[1,'questions'],kaogong_practice:[1,'rounds'],kaogong_progress:[1,'days'],personal_workbench_role_bindings:[1,'bindings']};for(const[name,[version,table]]of Object.entries(specs))await writeFile(join(home,'storages',name+'.json'),JSON.stringify({unit:{name,version},global:name==='kaogong_progress'?{examDate:'2027-03-01',dailyModules:2,subjects:[{name:'申论',weight:1}]}:name==='kaogong_lessons'?{instanceId:'default',activeLessonId:null}:null,tables:{[table]:name==='kaogong_knowledge'?{private:{subject:'申论',knowledgePoint:'',title:'unknown source',content:'private evidence',kind:'讲义',source:'unproven',tags:[],createdAt:'2020-01-01',updatedAt:'2020-01-01'}}:{}}}));return home}
test('pure concrete plan pins every source byte and keeps unproven lectures private with stable target IDs',async()=>{
 const home=await fixture();try{const {snapshot}=await inspectLegacy({home}),before=await readFile(join(home,'storages/kaogong_knowledge.json'));const plan=await prepareLegacyAdoption({snapshot,inspectRole:async()=>assert.fail('no roles in source')});assert.equal(plan.status,'ready');assert.notEqual(plan.targets.history.instanceId,plan.targets.library.instanceId);assert.equal(plan.records.find(row=>row.key==='private').target,'history');assert.equal(plan.privateKnowledgeIds.includes('private'),true);assert.equal(plan.records.filter(row=>row.target==='library'&&row.domain==='knowledge').length,0);assert.equal(plan.source.revision,snapshot.sourceRevision);assert.equal(plan.source.files.length,7);assert.equal(plan.fingerprint.length,64);assert.deepEqual(await readFile(join(home,'storages/kaogong_knowledge.json')),before);assert.equal(plan.rollback.mode,'journal-only-no-source-or-profile-restore')}finally{await rm(home,{recursive:true,force:true})}
})

test('malformed or lossy source values cannot produce an executable plan even when the offline container is valid',async()=>{
 const home=await fixture();try{const path=join(home,'storages/kaogong_knowledge.json'),data=JSON.parse(await readFile(path,'utf8'));data.tables.entries.private.futureField='must not be discarded';await writeFile(path,JSON.stringify(data));const {snapshot}=await inspectLegacy({home});await assert.rejects(prepareLegacyAdoption({snapshot,inspectRole:async()=>assert.fail('no roles')}),{code:'LEGACY_RECORD_UNSUPPORTED_OR_LOSSY'})}finally{await rm(home,{recursive:true,force:true})}
})
