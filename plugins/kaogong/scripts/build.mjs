import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {realpath,readdir,copyFile,mkdir} from 'node:fs/promises'
import {dirname,resolve,relative,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {cleanBuildOutput} from './build-output.mjs'

// Installs never run here. All build tools must be physical plugin-owned files.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(resolve(root,'package.json'))
const tsdown=require.resolve('tsdown/run'),tsc=require.resolve('typescript/bin/tsc')
for(const tool of [tsdown,tsc]){const actual=await realpath(tool),offset=relative(resolve(root,'node_modules'),actual);if(!offset||isAbsolute(offset)||offset==='..'||offset.startsWith('..'))throw Error('PLUGIN_PHYSICAL_BUILD_TOOLS_REQUIRED')}
const host=process.argv.includes('--host'),client=process.argv.includes('--client')
if(!client)await cleanBuildOutput(root,resolve(root,'lib'))
const commands=[]
if(!client)commands.push([tsdown,'-c','tsdown.host.config.ts'])
if(!host)commands.push([tsdown,'-c','tsdown.config.ts'],[resolve(root,'scripts/check-client-types.mjs'),'--emit'])
if(!client)commands.push([resolve(root,'scripts/check-host-types.mjs'),'--emit'])
for(const args of commands){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true,env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1)}

await mkdir(resolve(root,'lib/types'),{recursive:true})
for(const file of await readdir(resolve(root,'src')))if(file.endsWith('.d.mts'))await copyFile(resolve(root,'src',file),resolve(root,'lib/types',file))
