import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
import {readFile} from 'node:fs/promises'
const root=fileURLToPath(new URL('../',import.meta.url))
const {name}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
await build({absWorkingDir:root,entryPoints:['src/index.ts'],outdir:'lib',bundle:true,format:'esm',platform:'neutral',packages:'external'})
// DSH alpha.2 loads classic scripts and materializes their factory with its
// shared module table. Keep React external so hooks use the host's identity.
await build({absWorkingDir:root,entryPoints:['src/client.tsx'],outdir:'lib',bundle:true,format:'cjs',platform:'browser',packages:'external',jsx:'automatic',banner:{js:`window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;`},footer:{js:'return module.exports;}});'}})
