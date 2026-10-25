import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile,realpath,access} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {dirname,join,resolve,isAbsolute,relative} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const archive=resolve(process.argv[2]??''),native=process.env.DSH_SOURCE,base=process.env.KAOGONG_INSTALL_GATE_ROOT,worktable=process.env.KAOGONG_WORKTABLE_ARCHIVE
assert(native&&isAbsolute(native),'DSH_SOURCE must identify the built official installation')
assert(base&&isAbsolute(base),'KAOGONG_INSTALL_GATE_ROOT must identify a separate owned C test directory')
assert(worktable&&isAbsolute(worktable),'KAOGONG_WORKTABLE_ARCHIVE must identify the exact reviewed peer archive')
await access(archive);await access(worktable)
// A development ancestor must never rescue a missing production peer.
for(let parent=resolve(base);;parent=dirname(parent)){assert(!existsSync(join(parent,'node_modules')),'Installed identity root has a development node_modules ancestor: '+parent);if(dirname(parent)===parent)break}
const root=join(base,'identity-'+randomUUID()),home=join(root,'home'),profile=join(home,'profiles','web')
await mkdir(root,{recursive:true})
const env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'}
for(const key of ['NODE_PATH','NODE_OPTIONS','TSX_TSCONFIG_PATH','KAOGONG_TEST_RUNTIME','DEEPSEEK_API_KEY','OPENAI_API_KEY','COMMANDCODE_API_KEY','DSH_TOKEN'])delete env[key]
const run=async(args,name)=>{const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,windowsHide:true});await writeFile(join(root,name+'.private.log'),String(result.stdout??'')+'\n'+String(result.stderr??''));assert.equal(result.status,0,'Official installed identity '+name+' failed; see '+join(root,name+'.private.log'));return result.stdout}
await run([join(native,'apps/cli/lib/bin.js'),'plugin','--profile','web','add',worktable,archive,'--offline'],'official-cli-install')
const installed=JSON.parse(await readFile(join(profile,'node_modules/@deepseek-ai/dsh-tool-kaogong/package.json'),'utf8'))
const peer=JSON.parse(await readFile(join(profile,'node_modules/dsh-worktable/package.json'),'utf8'))
assert.equal(installed.version,'0.2.0-rc.3.5');assert.equal(peer.version,'0.10.0-rc.3.6');assert.equal(installed.peerDependencies['dsh-worktable'],peer.version)
const verify=join(root,'verify-installed.mjs')
await writeFile(verify,`
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,realpath} from 'node:fs/promises'
import {join,relative,isAbsolute} from 'node:path'
import {pathToFileURL} from 'node:url'
const native=${JSON.stringify(native)},home=${JSON.stringify(home)},profile=${JSON.stringify(profile)},anchor=join(native,'apps/cli/package.json')
const hostRequire=createRequire(anchor),consumerRequire=createRequire(join(profile,'package.json'))
const {Context}=await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')).href)
const {loadProfileDirectory,createRuntimeResolution,PluginPackages}=await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-app-boot')).href)
const resolution=await createRuntimeResolution({installAnchor:anchor,home,profile:loadProfileDirectory('dsh',profile,anchor)})
const ctx=new Context();await ctx.plugin(PluginPackages,{resolution})
try{
 const anchors={},directories=new Map()
 for(const name of ['@deepseek-ai/cordis','@deepseek-ai/dsh-agent-preset-registry','@deepseek-ai/dsh-scope']){
  const rows=ctx.pluginPackages.resolution.entries.filter(row=>row.scope==='installation'&&row.name===name);assert.equal(rows.length,1,name+' must have one official installation owner')
  const row=rows[0],dir=await realpath(row.packageDir),rel=relative(await realpath(native),dir);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),name+' escapes the official installation')
  const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));assert.equal(pkg.name,name);assert.equal(pkg.version,row.version);directories.set(name,dir);anchors[name]={version:row.version,directory:rel.replaceAll('\\\\','/')}
 }
 assert.equal(anchors['@deepseek-ai/dsh-agent-preset-registry'].version,anchors['@deepseek-ai/dsh-scope'].version)
 const scopeEntry=createRequire(join(directories.get('@deepseek-ai/dsh-scope'),'package.json')).resolve('@deepseek-ai/dsh-scope'),scope=await import(pathToFileURL(scopeEntry).href),key={},owned=scope.createScope(ctx,key)
 try{assert.equal(scope.scopeOf(owned.ctx),key)}finally{await owned.dispose()}
 const installed=await import(pathToFileURL(consumerRequire.resolve('@deepseek-ai/dsh-tool-kaogong')).href)
 const worktable=await import(pathToFileURL(consumerRequire.resolve('dsh-worktable')).href)
 assert.equal(typeof installed.apply,'function');assert.equal(typeof worktable.apply,'function')
 console.log(JSON.stringify({officialCLI:true,noDevelopmentAncestor:true,publicRuntimeResolution:true,installedHostImport:true,officialScopeIdentity:true,anchors}))
}finally{await ctx.fiber.dispose()}
`)
const output=await run([verify],'runtime-identity')
console.log(output.trim());console.log('Official installed identity receipt: '+root)
