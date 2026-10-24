/** Offline business preview only. Native identity is deliberately blocked; this CLI has no apply path. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {prepareLegacyAdoption,fingerprint} from '../src/legacy-adoption-plan.ts'
import {revalidatePlanSource} from '../src/legacy-plan-source.ts'
import {adoptionPreview} from '../src/adoption-preview.ts'
const fail=code=>{throw Object.assign(Error(code),{code})}
const inside=(root,value)=>{const rel=path.relative(root,value);return !rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
try{
 const input={}
 for(let index=2;index<process.argv.length;index+=2){const key=process.argv[index],value=process.argv[index+1];if(!['--home','--plan','--preview'].includes(key)||!value||input[key])fail('EXPLICIT_PREVIEW_ARGUMENTS_REQUIRED');input[key]=value}
 if(!input['--home']||!input['--plan']||!input['--preview']||!Object.values(input).every(path.isAbsolute)||!input['--plan'].endsWith('.private.json'))fail('EXPLICIT_PRIVATE_PREVIEW_PATHS_REQUIRED')
 const home=await fs.realpath(input['--home']),outputs=[]
 for(const name of ['--plan','--preview']){const parent=await fs.realpath(path.dirname(input[name])),output=path.join(parent,path.basename(input[name]));if(inside(home,output)||outputs.includes(output))fail('PREVIEW_OUTPUT_IN_SOURCE');try{await fs.lstat(output);fail('PREVIEW_OUTPUT_EXISTS')}catch(error){if(error.code!=='ENOENT')throw error}outputs.push(output)}
 const {snapshot}=await inspectLegacy({home})
 const prepared=await prepareLegacyAdoption({snapshot,inspectRole:async()=>({status:'blocked',fingerprint:null,blockers:[{code:'NATIVE_HOST_NOT_INSPECTED',reason:'离线业务预览没有访问正式原生宿主；需在同一个真实宿主通过公共接口核验身份。'}]})})
 const {fingerprint:old,...body}=prepared
 const blocked={...body,status:'blocked',blockers:[...body.blockers,{code:'NATIVE_HOST_NOT_INSPECTED'}]}
 const plan={...blocked,fingerprint:fingerprint(blocked)}
 await revalidatePlanSource(plan,home)
 const preview=adoptionPreview(plan)
 await fs.writeFile(outputs[0],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600})
 await fs.writeFile(outputs[1],preview.markdown+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({status:'offline-native-blocked',counts:plan.counts,roles:plan.roles.length,fingerprint:plan.fingerprint,formalApply:false}))
}catch(error){const code=typeof error?.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'PREVIEW_FAILED';console.error('PREVIEW_BLOCKED: '+code);process.exitCode=1}
