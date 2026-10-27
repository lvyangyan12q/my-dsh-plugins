import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),native=process.env.DSH_SOURCE??process.env.KAOGONG_TEST_RUNTIME
assert(native,'Set DSH_SOURCE to built official rc.3 checkout')
const require=createRequire(resolve(root,'package.json')),loader=pathToFileURL(require.resolve('tsx/esm')).href
const host=['standalone-host.test.mjs','standalone-native.test.mjs','current-study-handoff.test.mjs','instance-state.test.mjs','verified-practice-materials.test.mjs','mineru.test.ts','build-runner.test.mjs']
const client=['material-location-page.test.tsx','practice-statistics-page.test.tsx','standalone-client.test.tsx','current-study-panel.test.tsx','learner-draft-page.test.tsx','standalone-native-navigation.test.ts','teaching-task-panel.test.tsx','study-source-panel.test.tsx','sdk-client-runtime.test.ts','sdk-classroom.test.ts']
const domain=['lessons.test.mjs','practice-rounds.test.mjs']
const domainPattern='lesson links|unsupported, foreign|additive migration|same subject role|score-only completion|one aggregate write|canonical cause|ten-question cycles|durable scoring|partial notebook failure|reflection retries|notebook commands|repair-style material|explicit knowledge point|verified display supplements|publisher solution annotations|unverified option adverts|bibliographic analysis titles|bibliographic metadata|only a bounded bibliography|reviewed one-question answer'
const mode=process.argv.includes('--domain')?'domain':process.argv.includes('--host')?'host':process.argv.includes('--client')?'client':'all'
const groups=mode==='all'?[['host',host],['client',client]]:[[mode,mode==='host'?host:mode==='client'?client:domain]]
for(const [kind,files]of groups){
 const filter=kind==='domain'?['--test-name-pattern='+domainPattern]:[]
 const result=spawnSync(process.execPath,['--import',loader,'--test',...filter,...files.map(file=>resolve(root,'tests',file))],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,DSH_SOURCE:native,KAOGONG_TEST_RUNTIME:native,TSX_TSCONFIG_PATH:kind==='client'?resolve(root,'tsconfig.test-client.json'):resolve(native,'tsconfig.json')}})
 if(result.status!==0){process.exitCode=result.status??1;break}
}
