import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,readdir,realpath,stat} from 'node:fs/promises'
import {dirname,join,relative,isAbsolute} from 'node:path'
const native=name=>name.startsWith('@deepseek-ai/')
const inside=(root,path)=>{const rel=relative(root,path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel)}
async function packageAnchor(entry,name){let dir=dirname(entry);for(;;){const manifest=await readFile(join(dir,'package.json'),'utf8').catch(()=>undefined);if(manifest&&JSON.parse(manifest).name===name)return realpath(dir);const next=dirname(dir);assert.notEqual(next,dir,'Package manifest missing: '+name);dir=next}}
async function manifestPackages(source){const packages=new Map();let count=0;async function visit(dir){assert(++count<=10000,'Native workspace discovery exceeded bound');const manifest=await readFile(join(dir,'package.json'),'utf8').catch(()=>undefined);if(manifest){const value=JSON.parse(manifest);if(typeof value.name==='string'){assert(!packages.has(value.name),'Duplicate native package manifest: '+value.name);packages.set(value.name,dir)}}for(const row of await readdir(dir,{withFileTypes:true}))if(row.isDirectory()&&!row.name.startsWith('.')&&!['node_modules','lib','dist'].includes(row.name))await visit(join(dir,row.name))}await visit(source);return packages}
/** Resolve public native anchors from the selected built workspace; products remain archive-owned. */
export async function resolveReleaseDependencies({worktree,source,dependencies}) {
 const sourceRoot=await realpath(source),ordinary=createRequire(join(worktree,'package.json')),sourceRequire=createRequire(join(sourceRoot,'package.json')),pnpmRequire=createRequire(join(sourceRoot,'node_modules/.pnpm/node_modules/_release-anchor.cjs')),overrides={},nativeAnchors={};let manifests
 for(const dep of new Set(dependencies)){
  let entry
  if(native(dep)){
   let foreign
   for(const require of [sourceRequire,pnpmRequire]){let candidate;try{candidate=await realpath(require.resolve(dep))}catch(error){if(error.code!=='MODULE_NOT_FOUND'&&error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error;continue}const anchor=await packageAnchor(candidate,dep);if(!inside(sourceRoot,anchor)||!inside(sourceRoot,candidate)){foreign=Error('Native dependency escapes DSH_SOURCE: '+dep);continue}entry=candidate;break}
   if(!entry&&foreign)throw foreign
   if(!entry){manifests??=await manifestPackages(sourceRoot);const dir=manifests.get(dep);assert(dir,'Native dependency missing from DSH_SOURCE: '+dep);const require=createRequire(join(dir,'package.json'));try{entry=require.resolve(dep)}catch(error){if(error.code!=='MODULE_NOT_FOUND'&&error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error;entry=require.resolve(dir)}}
  }else entry=ordinary.resolve(dep)
  entry=await realpath(entry);const anchor=await packageAnchor(entry,dep)
  assert((await stat(entry)).isFile(),'Dependency entry missing: '+dep)
  if(native(dep)){assert(inside(sourceRoot,anchor)&&inside(sourceRoot,entry),'Native dependency escapes DSH_SOURCE: '+dep);assert(!/\.(?:ts|tsx)$/.test(entry),'Native dependency is not built: '+dep);nativeAnchors[dep]={root:relative(sourceRoot,anchor).replaceAll('\\','/'),entry:relative(sourceRoot,entry).replaceAll('\\','/')}}
  overrides[dep]='link:'+anchor.replaceAll('\\','/')
 }
 return {overrides,nativeAnchors,nativeSource:sourceRoot}
}
