import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
test('built plugin declares valid domain and registers a native artifact tool against real host modules',{skip:!process.env.DSH_SOURCE},()=>{
 const code=`const m=await import('./plugins/personal-learning/lib/index.js');let effect,tool;const state=m.learningDomain.global.schema.parse(m.learningDomain.global.initial);m.apply({effect:fn=>effect=fn,storageDomain:{open:async()=>({global:{get:()=>state,set:async()=>{}},close:()=>{}})},skills:{register:()=>()=>{}},tools:{register:t=>{tool=t;return ()=>{}}},webServer:{register:()=>()=>{}}});const disposers=[];for await(const d of effect())disposers.push(d);if(!tool)throw Error('No native tool');for(const d of disposers.reverse())await d();console.log('native declaration and registration pass')`;
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:resolve(import.meta.dirname,'../../..'),env:{...process.env,TSX_TSCONFIG_PATH:resolve(process.env.DSH_SOURCE,'tsconfig.json')},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/registration pass/)
});
