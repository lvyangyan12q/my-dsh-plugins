import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url)
for(const args of [['--noEmit'],['tests/sdk-shapes.ts','--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2024,DOM,ESNext.Disposable']]){
 const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),...args],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1)
}
