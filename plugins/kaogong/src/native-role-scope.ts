import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import {readFile,realpath} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

type ScopeRuntime=typeof import('@deepseek-ai/dsh-scope')
const fail=(code:string):never=>{throw new Error(code)}
const inside=(root:string,path:string)=>{const value=relative(root,path);return !isAbsolute(value)&&value!=='..'&&!value.startsWith('..'+sep)}
/** JSONC only: no evaluation, package extends, wildcard aliases, or arbitrary source lookup. */
function jsonc(text:string):Record<string,any>{
 if(text.length>1024*1024)fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED')
 let value='',quoted=false,escaped=false
 for(let i=0;i<text.length;i++){const char=text[i]!,next=text[i+1]
  if(quoted){value+=char;if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
  if(char==='"'){quoted=true;value+=char;continue}
  if(char==='/'&&next==='/'){while(i<text.length&&text[i]!=='\n')i++;value+='\n';continue}
  if(char==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i++;value+=' ';continue}
  value+=char
 }
 let clean='';quoted=false;escaped=false
 for(let i=0;i<value.length;i++){const char=value[i]!
  if(quoted){clean+=char;if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue}
  if(char==='"'){quoted=true;clean+=char;continue}
  if(char===','){let at=i+1;while(/\s/.test(value[at]??'')&&at<value.length)at++;if(value[at]==='}'||value[at]===']')continue}
  clean+=char
 }
 return JSON.parse(clean)
}
async function aliases(file:string,root:string,depth=0):Promise<Record<string,string>>{
 if(depth>4||!inside(root,await realpath(file)))fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED')
 const data=jsonc(await readFile(file,'utf8'));let inherited:Record<string,string>={}
 if(data.extends!==undefined){if(typeof data.extends!=='string'||!data.extends.startsWith('.')||!data.extends.endsWith('.json'))fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED');inherited=await aliases(resolve(dirname(file),data.extends),root,depth+1)}
 const options=data.compilerOptions;if(options?.paths===undefined)return inherited
 if(!options.paths||typeof options.paths!=='object'||Array.isArray(options.paths)||options.baseUrl!==undefined&&typeof options.baseUrl!=='string')fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED')
 const result:Record<string,string>={};for(const name of ['@deepseek-ai/dsh-scope','@deepseek-ai/dsh-agent-preset-registry']){const values=options.paths[name];if(Array.isArray(values)&&values.length===1&&typeof values[0]==='string'&&!values[0].includes('*'))result[name]=resolve(dirname(file),options.baseUrl??'.',values[0])}return result
}
async function hasActiveTsx(anchor:string){
 const imports:string[]=[];for(let i=0;i<process.execArgv.length;i++){const value=process.execArgv[i]!;if(value==='--import'&&process.execArgv[i+1])imports.push(process.execArgv[++i]!);else if(value.startsWith('--import='))imports.push(value.slice(9))}
 for(const value of imports)try{
  const entry=value.startsWith('file:')?fileURLToPath(value):isAbsolute(value)?value:createRequire(anchor).resolve(value),require=createRequire(pathToFileURL(entry)),manifest=JSON.parse(await readFile(require.resolve('tsx/package.json'),'utf8'))
  if(manifest.name!=='tsx')continue
  const actual=await realpath(entry);for(const name of ['tsx','tsx/esm'])if(actual===await realpath(require.resolve(name)))return true
 }catch{}
 return false
}
/** A public discovery result is only a candidate; the actual Native scope probe remains decisive. */
async function declaredSource(scopeManifest:string,presetManifest:string,version:string){
 if(version!=='0.2.1-rc.3'||!await hasActiveTsx(presetManifest))return
 let config=process.env.TSX_TSCONFIG_PATH
 if(config===undefined){
  // TSX exposes no active-config accessor. Reproduce its default cwd search
  // using a declared public dependency, without inspecting loader internals.
  try{config=(await import('get-tsconfig')).getTsconfig(process.cwd())?.path}
  catch{fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED')}
 }
 if(!config||!isAbsolute(config))return
 const root=dirname(await realpath(config)),scopeRoot=await realpath(dirname(scopeManifest)),presetRoot=await realpath(dirname(presetManifest))
 if(!inside(root,scopeRoot)||!inside(root,presetRoot))return
 const paths=await aliases(config,root),requests=[['@deepseek-ai/dsh-scope',scopeManifest],['@deepseek-ai/dsh-agent-preset-registry',presetManifest]] as const
 let source:string|undefined
 for(const[name,manifest]of requests){const mapped=paths[name];if(!mapped)return;const entry=createRequire(manifest).resolve(name+'/src/index.ts'),canonical=await realpath(entry);if(!inside(await realpath(dirname(manifest)),canonical))fail('NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED');let matches=false;for(const path of [mapped,join(mapped,'index.ts')])try{if(await realpath(path)===canonical)matches=true}catch{}if(!matches)return;if(name==='@deepseek-ai/dsh-scope')source=entry}
 return source
}
async function recognized(ctx:Context,runtime:ScopeRuntime){
 const probe=runtime.createScope(ctx,{})
 try{await ctx.agentPresets.mount(probe.ctx,'standard');if(ctx.agentPresets.composedPreset(probe.ctx)!=='standard')fail('NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED');return true}
 catch(error){if(error instanceof Error&&error.message==='Agent preset binding requires a scoped context')return false;throw error}
 finally{await probe.dispose()}
}
/** Public installation metadata plus actual Native preset admission, without a Session or persona registration. */
export async function nativeRoleScope(ctx:Context):Promise<ScopeRuntime>{
 const presetName='@deepseek-ai/dsh-agent-preset-registry',scopeName='@deepseek-ai/dsh-scope',entries=ctx.get('pluginPackages')?.resolution?.entries
 if(!Array.isArray(entries))fail('NATIVE_ROLE_SCOPE_METADATA_UNAVAILABLE')
 const installed=(name:string)=>{const rows=entries!.filter(row=>row.name===name&&row.scope==='installation');if(rows.length!==1||typeof rows[0]!.packageDir!=='string'||!isAbsolute(rows[0]!.packageDir)||typeof rows[0]!.version!=='string')fail('NATIVE_ROLE_SCOPE_INSTALLATION_IDENTITY_UNAVAILABLE');return rows[0]!}
 const presetPackage=installed(presetName),scopePackage=installed(scopeName),presetManifest=join(presetPackage.packageDir,'package.json'),scopeManifest=join(scopePackage.packageDir,'package.json')
 const preset=JSON.parse(await readFile(presetManifest,'utf8')),scope=JSON.parse(await readFile(scopeManifest,'utf8'))
 if(preset.version!==presetPackage.version||scope.version!==scopePackage.version)fail('NATIVE_ROLE_SCOPE_INSTALLATION_METADATA_CHANGED')
 if(preset.name!==presetName||scope.name!==scopeName||typeof preset.version!=='string'||scope.version!==preset.version)fail('NATIVE_ROLE_SCOPE_INSTALLATION_IDENTITY_UNAVAILABLE')
 const load=async(entry:string):Promise<ScopeRuntime>=>{const runtime=await import(pathToFileURL(entry).href);if(typeof runtime.createScope!=='function'||typeof runtime.scopeOf!=='function')fail('NATIVE_ROLE_SCOPE_API_UNAVAILABLE');return runtime}
 const compiled=await load(createRequire(scopeManifest).resolve(scopeName));if(await recognized(ctx,compiled))return compiled
 const source=await declaredSource(scopeManifest,presetManifest,preset.version);if(source){const runtime=await load(source);if(await recognized(ctx,runtime))return runtime}
 return fail('NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED')
}
