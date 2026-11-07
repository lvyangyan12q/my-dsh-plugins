import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['preview/entry.tsx'],
  outfile: 'preview/bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: {'process.env.NODE_ENV': '"development"'},
  logLevel: 'warning',
})
