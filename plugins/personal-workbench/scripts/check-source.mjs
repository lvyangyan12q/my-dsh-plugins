import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Owner-local check against an already-built official checkout; no profile is opened.
const source = process.env.DSH_SOURCE
if (!source) throw new Error('Set DSH_SOURCE to an already-built official DSH checkout')
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(source, 'package.json'))
const paths = {}
for (const top of ['packages', 'vendor']) {
  const roots = top === 'vendor' ? [resolve(source, top)] :
    (await readdir(resolve(source, top), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => resolve(source, top, entry.name))
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folder = resolve(root, entry.name)
      let manifest
      try { manifest = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') continue; throw error }
      for (const [key, value] of Object.entries(manifest.exports ?? {})) {
        if (typeof value !== 'object' || value === null || typeof value.types !== 'string' || key.includes('*')) continue
        paths[manifest.name + (key === '.' ? '' : key.slice(1))] = [resolve(folder, value.types)]
      }
      if (manifest.types && !paths[manifest.name]) paths[manifest.name] = [resolve(folder, manifest.types)]
    }
  }
}
const clientRequire = createRequire(resolve(source, 'packages/client/ui-conversation/package.json'))
const reactTypes = dirname(clientRequire.resolve('@types/react/package.json'))
paths.react = [resolve(reactTypes, 'index.d.ts')]
paths['react/jsx-runtime'] = [resolve(reactTypes, 'jsx-runtime.d.ts')]
await mkdir(resolve(plugin, '.checks'), { recursive: true })
await writeFile(resolve(plugin, '.checks/tsconfig.json'), JSON.stringify({
  extends: '../tsconfig.json',
  compilerOptions: { paths, types: ['node'], typeRoots: [dirname(dirname(require.resolve('@types/node/package.json'))), dirname(reactTypes)] },
  include: ['../src', '../tests'],
}, null, 2) + '\n')
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', resolve(plugin, '.checks/tsconfig.json')], { stdio: 'inherit', cwd: plugin })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
