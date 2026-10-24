import assert from 'node:assert/strict'
import {mkdir,writeFile,rm} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import ts from 'typescript'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),native=process.env.DSH_SOURCE??process.env.KAOGONG_TEST_RUNTIME
assert(native,'Set DSH_SOURCE to the official rc.3 checkout for current integration tests')
const base=ts.readConfigFile(resolve(native,'tsconfig.base.json'),ts.sys.readFile).config
const paths=Object.fromEntries(Object.entries(base.compilerOptions.paths).map(([name,targets])=>[name,targets.map(target=>resolve(native,target))]))
paths['dsh-worktable/sdk']=[resolve(root,'../worktable/01_content/src/sdk.mjs')]
const temp=resolve(root,'.scratch','test-'+randomUUID())
await mkdir(temp,{recursive:true})
try{
 const config=resolve(temp,'tsconfig.json')
 await writeFile(config,JSON.stringify({compilerOptions:{target:'ES2024',module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',paths}}))
 const host=['acceptance-source.test.mjs','legacy-inspection.test.mjs','legacy-material-evidence.test.mjs','legacy-bank-image-evidence.test.mjs','legacy-private-assets.test.mjs','adopted-assets.test.mjs','adoption-assets-host.test.mjs','legacy-adoption-plan.test.mjs','legacy-adoption-workflow.test.mjs','instance-host.test.mjs','production-host.test.mjs','instance-state.test.mjs','role-presets.test.mjs','runtime-compat.test.mjs']
 const client=['legacy-image-client.test.ts','sdk-classroom.test.ts','sdk-client-runtime.test.ts']
 const domain=['lessons.test.mjs','practice-rounds.test.mjs']
 const domainPattern='lesson links|unsupported, foreign|additive migration|same subject role|score-only completion|one aggregate write|canonical cause|ten-question cycles|durable scoring|partial notebook failure|reflection retries|notebook commands|repair-style material|explicit knowledge point|verified display supplements|publisher solution annotations|unverified option adverts|bibliographic analysis titles|bibliographic metadata|only a bounded bibliography|reviewed one-question answer'
 const files=process.argv.includes('--domain')?domain:process.argv.includes('--host')?host:process.argv.includes('--client')?client:[...host,...client]
 const filter=process.argv.includes('--domain')?['--test-name-pattern='+domainPattern]:[]
 const result=spawnSync(process.execPath,['--import','tsx/esm','--test',...filter,...files.map(file=>resolve(root,'tests',file))],{cwd:root,stdio:'inherit',env:{...process.env,KAOGONG_TEST_RUNTIME:native,TSX_TSCONFIG_PATH:config}})
 process.exitCode=result.status??1
}finally{await rm(temp,{recursive:true,force:true})}
