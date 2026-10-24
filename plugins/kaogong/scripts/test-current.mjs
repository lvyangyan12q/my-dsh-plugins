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
 const host=['legacy-inspection.test.mjs','legacy-material-evidence.test.mjs','legacy-bank-image-evidence.test.mjs','legacy-private-assets.test.mjs','adopted-assets.test.mjs','adoption-assets-host.test.mjs','legacy-adoption-plan.test.mjs','legacy-adoption-workflow.test.mjs','instance-host.test.mjs','production-host.test.mjs','instance-state.test.mjs','role-presets.test.mjs','runtime-compat.test.mjs']
 const client=['sdk-classroom.test.ts','sdk-client-runtime.test.ts']
 const files=process.argv.includes('--host')?host:process.argv.includes('--client')?client:[...host,...client]
 const result=spawnSync(process.execPath,['--import','tsx/esm','--test',...files.map(file=>resolve(root,'tests',file))],{cwd:root,stdio:'inherit',env:{...process.env,KAOGONG_TEST_RUNTIME:native,TSX_TSCONFIG_PATH:config}})
 process.exitCode=result.status??1
}finally{await rm(temp,{recursive:true,force:true})}
