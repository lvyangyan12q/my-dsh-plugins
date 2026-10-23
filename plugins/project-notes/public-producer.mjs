import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,cpSync,copyFileSync,existsSync} from 'node:fs'
import {join,resolve,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const here=dirname(fileURLToPath(import.meta.url))
const nativeVersions=['0.2.0-rc.2','0.2.1-alpha.2']
const nativePaths={'@deepseek-ai/cordis':'vendor/cordis','@deepseek-ai/schemastery':'vendor/schemastery','@deepseek-ai/dsh-client-locale':'packages/client/locale','@deepseek-ai/dsh-host-webserver':'packages/host/webserver','@deepseek-ai/dsh-storage-domain':'packages/storage/storage-domain','@deepseek-ai/dsh-skill':'packages/skill/skill','@deepseek-ai/dsh-client-connection':'packages/client/connection'}
const json=file=>JSON.parse(readFileSync(file,'utf8'))
export function command(command,args,cwd){const result=spawnSync(command,args,{cwd,encoding:'utf8'});if(result.error)throw result.error;if(result.status!==0)throw Error([command,...args].join(' ')+'\n'+result.stdout+'\n'+result.stderr);return result.stdout}
function identity(base,name){const require=createRequire(join(base,'package.json')),file=require.resolve(name+'/package.json');return {name,version:json(file).version,realpath:realpathSync(dirname(file))}}
/** A real archive install plus explicit official peers; no peer bypass or ancestor fallback. */
export function installPublicEnvironment({folder,source,worktable,archive,npm=process.env.npm_execpath}){
 assert.ok(source&&worktable&&npm,'Set DSH_SOURCE, exact WORKTABLE_PACKAGE and npm_execpath (npm run check/pack).')
 source=realpathSync(resolve(source));worktable=realpathSync(resolve(worktable));const pkg=json(join(here,'package.json'))
 const nativeVersion=json(join(source,'package.json')).version;assert.ok(nativeVersions.includes(nativeVersion),'Unvalidated native candidate: '+nativeVersion)
 const peers=Object.entries(nativePaths).map(([name,path])=>{const root=join(source,path),value=json(join(root,'package.json'));assert.equal(value.name,name);assert.equal(value.version,name==='@deepseek-ai/cordis'?(nativeVersion==='0.2.0-rc.2'?'4.0.4':'4.0.5-alpha.1'):name==='@deepseek-ai/schemastery'?(nativeVersion==='0.2.0-rc.2'?'3.18.4':'3.18.5-alpha.1'):nativeVersion);assert.ok(existsSync(join(root,value.types)),'Build official public declarations first: '+name);return root})
 mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'package.json'),JSON.stringify({name:'notes-public-environment',version:'0.0.0',private:true,type:'module'}))
 const libraries=['@standard-schema/spec@^1.1.0','zod@'+pkg.dependencies.zod,...['react','@types/react','@types/node','typescript'].map(name=>name+'@'+pkg.devDependencies[name])]
 command(process.execPath,[npm,'install',worktable,...(archive?[resolve(archive)]:[]),...peers,...libraries,'--offline','--ignore-scripts','--omit=optional','--no-audit','--no-fund'],folder)
 const sdk=identity(folder,'dsh-worktable'),notesCordis=identity(folder,'@deepseek-ai/cordis'),sdkCordis=identity(sdk.realpath,'@deepseek-ai/cordis'),nativeSkill=identity(folder,'@deepseek-ai/dsh-skill'),skillCordis=identity(nativeSkill.realpath,'@deepseek-ai/cordis')
 assert.equal(notesCordis.realpath,realpathSync(join(source,'vendor/cordis')),'producer must use the chosen official Cordis')
 assert.equal(sdkCordis.realpath,notesCordis.realpath,'SDK augmentation must address the same public Cordis identity')
 assert.equal(skillCordis.realpath,notesCordis.realpath,'Skill augmentation must address the same public Cordis identity')
 assert.ok(sdk.realpath.startsWith(realpathSync(folder)),'SDK must be installed from the archive, not a source junction')
 return {nativeVersion,producer:realpathSync(folder),source,worktableSha256:createHash('sha256').update(readFileSync(worktable)).digest('hex'),nativeCordis:notesCordis,notesCordis,sdkCordis,skillCordis,nativeSkill,sdk,nativePeers:Object.keys(nativePaths).map(name=>identity(folder,name)),npmLegacyPeerBypass:false}
}
export function checkPublicProducer({source=process.env.DSH_SOURCE,worktable=process.env.WORKTABLE_PACKAGE,npm=process.env.npm_execpath}={}){
 const folder=mkdtempSync(join(tmpdir(),'notes-public-producer-')),receipt=installPublicEnvironment({folder,source,worktable,npm})
 cpSync(join(here,'src'),join(folder,'src'),{recursive:true});mkdirSync(join(folder,'tests'));copyFileSync(join(here,'tests/sdk-shapes.ts'),join(folder,'tests/sdk-shapes.ts'))
 const config=json(join(here,'tsconfig.json'));config.compilerOptions.skipLibCheck=false;const specRoot=join(folder,'node_modules/@standard-schema/spec');config.compilerOptions.paths={'@standard-schema/spec':[join(specRoot,json(join(specRoot,'package.json')).types)]};writeFileSync(join(folder,'tsconfig.json'),JSON.stringify(config))
 const require=createRequire(join(folder,'package.json')),tsc=require.resolve('typescript/bin/tsc')
 command(process.execPath,[tsc,'--noEmit'],folder)
 command(process.execPath,[tsc,'tests/sdk-shapes.ts','--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2024,DOM,ESNext.Disposable'],folder)
 return {...receipt,status:'public-producer-types-passed',sourceAndContractTypes:true,skipLibCheck:false,typescript:identity(folder,'typescript'),reactTypes:identity(folder,'@types/react'),nodeTypes:identity(folder,'@types/node')}
}
