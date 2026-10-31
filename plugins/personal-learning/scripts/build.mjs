import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
await build({absWorkingDir:root,entryPoints:['src/index.ts','src/client.tsx'],outdir:'lib',bundle:true,format:'esm',platform:'neutral',packages:'external',jsx:'automatic'})
