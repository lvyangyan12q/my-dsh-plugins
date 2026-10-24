import assert from 'node:assert/strict'
import {readFile,mkdir,copyFile,rm} from 'node:fs/promises'
import {constants} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {npmCli} from '../../../scripts/release-tools.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
assert(pkg.engines.dsh==='0.2.1-rc.3'&&pkg.peerDependencies['dsh-worktable']==='0.10.0-rc.3.2','Candidate must target the reviewed rc.3 platform')
assert(!JSON.stringify(pkg).includes('dsh-personal-workbench'),'Legacy runtime dependency is forbidden')
assert(process.env.DSH_SOURCE,'Set DSH_SOURCE to the built official acceptance checkout')
const npm=npmCli(),run=args=>{const result=spawnSync(process.execPath,[npm,...args],{cwd:root,env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return result.stdout}
run(['run','build'])
run(['run','test:artifact'])
const temp=resolve(root,'.scratch','pack-'+randomUUID()),releases=resolve(root,'releases')
await mkdir(temp,{recursive:true});await mkdir(releases,{recursive:true})
try{
 const [pack]=JSON.parse(run(['pack','--ignore-scripts','--json','--pack-destination',temp]))
 const destination=resolve(releases,pack.filename)
 await copyFile(resolve(temp,pack.filename),destination,constants.COPYFILE_EXCL)
 console.log(destination)
}finally{await rm(temp,{recursive:true,force:true})}
