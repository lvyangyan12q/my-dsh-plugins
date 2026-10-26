import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,mkdir,readFile,copyFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

async function fixture(t,failHost=false){
 const root=await mkdtemp(join(tmpdir(),'kaogong-build-behavior-'))
 t.after(async()=>{const {cleanBuildOutput}=await import('../scripts/build-output.mjs');await cleanBuildOutput(tmpdir(),root)})
 for(const dir of ['scripts','node_modules/tsdown','node_modules/typescript/bin'])await mkdir(join(root,dir),{recursive:true})
 await copyFile(new URL('../scripts/build.mjs',import.meta.url),join(root,'scripts/build.mjs'))
 await copyFile(new URL('../scripts/build-output.mjs',import.meta.url),join(root,'scripts/build-output.mjs'))
 await writeFile(join(root,'package.json'),JSON.stringify({name:'kaogong-build-boundary',private:true,type:'module'}))
 await writeFile(join(root,'node_modules/tsdown/package.json'),JSON.stringify({name:'tsdown',type:'module',exports:{'./run':'./run.mjs'}}))
 const trace=join(root,'trace.jsonl')
 const record=`import{appendFileSync}from'node:fs';appendFileSync(${JSON.stringify(trace)},JSON.stringify(process.argv.slice(2))+'\\n');`
 await writeFile(join(root,'node_modules/tsdown/run.mjs'),record+(failHost?"if(process.argv.includes('tsdown.host.config.ts'))process.exit(42)":""))
 await writeFile(join(root,'node_modules/typescript/package.json'),JSON.stringify({name:'typescript',type:'module'}))
 await writeFile(join(root,'node_modules/typescript/bin/tsc'),record)
 await writeFile(join(root,'scripts/check-host-types.mjs'),record)
 await writeFile(join(root,'scripts/check-client-types.mjs'),record)
 await mkdir(join(root,'src'))
 return {root,trace}
}
test('public build consumes installed Node tools without any package manager and includes both public declaration gates',async t=>{
 const {root,trace}=await fixture(t)
 const result=spawnSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:root,env:{...process.env,PATH:''},encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
 assert.deepEqual((await readFile(trace,'utf8')).trim().split(/\r?\n/).map(JSON.parse),[['-c','tsdown.host.config.ts'],['-c','tsdown.config.ts'],['--emit'],['--emit']])
})
test('public build returns the failing tool status and does not build or emit later stages',async t=>{
 const {root,trace}=await fixture(t,true)
 const result=spawnSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:root,env:{...process.env,PATH:''},encoding:'utf8'})
 assert.equal(result.status,42,result.stderr)
 assert.deepEqual((await readFile(trace,'utf8')).trim().split(/\r?\n/).map(JSON.parse),[['-c','tsdown.host.config.ts']])
})
