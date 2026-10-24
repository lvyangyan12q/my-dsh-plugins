import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

// A build consumes installed tools; it never asks a package manager to install or repair them.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(resolve(root,'package.json'))
const tsdown=require.resolve('tsdown/run')
const tsc=require.resolve('typescript/bin/tsc')
for(const args of [
 [tsdown,'-c','tsdown.host.config.ts'],
 [tsdown,'-c','tsdown.config.ts'],
 [tsc,'-p','tsconfig.client.json'],
 [resolve(root,'scripts/check-host-types.mjs'),'--emit'],
]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true,env:process.env})
 if(result.error)throw result.error
 if(result.status!==0)process.exit(result.status??1)
}
