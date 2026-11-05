/**
 * Build dsh-paper-reader:
 *   lib/index.js   Node/Cordis host plugin (ESM)
 *   lib/client.js  browser bundle: CJS factory registered through
 *                  window.__ModuleLoader__.load; react is a host platform
 *                  module and stays external.
 *
 * esbuild resolves from the local devDependency. When this checkout is built
 * from a DSH source tree, point ESBUILD_MODULE at that tree's esbuild instead.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// `esbuild` is a devDependency. A checkout without a local install can point
// ESBUILD_MODULE at an existing `esbuild/lib/main.js` file URL instead.
const { build } = await import(process.env.ESBUILD_MODULE || 'esbuild')
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(here, 'dsh.plugin.json'), 'utf8'))
if (pkg.version !== manifest.version) {
  throw new Error(`version mismatch: package.json ${pkg.version} != dsh.plugin.json ${manifest.version}`)
}
mkdirSync(join(here, 'lib'), { recursive: true })

const pluginId = pkg.name
const clientBanner = {
  js: `window.__ModuleLoader__.load({ id: '${pluginId}', factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
}
const clientFooter = { js: 'return module.exports; } });' }

await build({
  entryPoints: [join(here, 'src/index.js')],
  outfile: join(here, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  external: ['@deepseek-ai/*', 'node:*'],
  logLevel: 'info',
})

await build({
  entryPoints: [join(here, 'src/client/index.jsx')],
  outfile: join(here, 'lib/client.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
  loader: { '.css': 'text' },
  banner: clientBanner,
  footer: clientFooter,
  logLevel: 'info',
})

console.log('[dsh-paper-reader] built lib/index.js and lib/client.js')
