import assert from 'node:assert/strict'
import {readFile,mkdir,copyFile,rm} from 'node:fs/promises'
import {constants} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {npmCli} from '../../../scripts/release-tools.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
assert(pkg.version==='0.2.0-rc.3.3'&&pkg.engines.dsh==='0.2.1-rc.3'&&pkg.peerDependencies['dsh-worktable']==='0.10.0-rc.3.5','Candidate must target the reviewed rc.3 platform')
assert(!JSON.stringify(pkg).includes('dsh-personal-workbench'),'Legacy runtime dependency is forbidden')
assert(process.env.DSH_SOURCE,'Set DSH_SOURCE to the built official acceptance checkout')
process.env.KAOGONG_TEST_RUNTIME=process.env.DSH_SOURCE
process.env.TSX_TSCONFIG_PATH=resolve(process.env.DSH_SOURCE,'tsconfig.json')
const npm=npmCli(),run=args=>{const result=spawnSync(process.execPath,[npm,...args],{cwd:root,env:process.env,encoding:'utf8'});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');assert.equal(result.status,0,'Release gate failed: '+args.join(' '));return result.stdout}
run(['run','build'])
run(['run','test:host'])
run(['run','test:client'])
run(['run','test:domain'])
run(['run','test:artifact'])
const temp=resolve(root,'.scratch','pack-'+randomUUID()),releases=resolve(root,'releases')
await mkdir(temp,{recursive:true});await mkdir(releases,{recursive:true})
try{
 const [pack]=JSON.parse(run(['pack','--ignore-scripts','--json','--pack-destination',temp]))
 const identity=spawnSync(process.execPath,[resolve(root,'scripts/check-installed-identity.mjs'),resolve(temp,pack.filename)],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:8*1024*1024})
 process.stdout.write(identity.stdout??'');process.stderr.write(identity.stderr??'');assert.equal(identity.status,0,'Official installed dependency identity gate failed')
 const destination=resolve(releases,pack.filename)
 await copyFile(resolve(temp,pack.filename),destination,constants.COPYFILE_EXCL)
 console.log(destination)
}finally{await rm(temp,{recursive:true,force:true})}
