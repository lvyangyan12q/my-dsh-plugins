/**
 * Sandbox-friendly build: invokes the esbuild binary with inherited stdio.
 *
 * The normal `build.mjs` uses esbuild's JS API, which spawns a helper with
 * piped stdio; some confined environments deny that. This entry keeps the same
 * output but only needs an esbuild executable:
 *
 *   $env:ESBUILD_BIN = 'C:\path\to\esbuild.exe'
 *   node scripts/build-local.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(here, 'dsh.plugin.json'), 'utf8'))
if (pkg.version !== manifest.version) throw new Error('package.json and dsh.plugin.json versions differ')

const bin = process.env.ESBUILD_BIN
if (!bin || !existsSync(bin)) {
  throw new Error('Set ESBUILD_BIN to an esbuild executable (for example .../@esbuild/win32-x64/esbuild.exe)')
}
mkdirSync(join(here, 'lib'), { recursive: true })

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', cwd: here })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`esbuild exited ${code}`)))
  })
}

await run([
  'src/index.js', '--bundle', '--platform=node', '--format=esm', '--target=node22',
  '--outfile=lib/index.js', '--external:@deepseek-ai/*', '--external:node:*',
])

const banner = `window.__ModuleLoader__.load({ id: '${pkg.name}', factory: (require) => { var module = { exports: {} }; var exports = module.exports;\n`
const footer = '\nreturn module.exports; } });\n'

await run([
  'src/client/index.jsx', '--bundle', '--platform=browser', '--format=cjs', '--target=es2022',
  '--jsx=automatic', '--loader:.css=text', '--outfile=lib/client.js',
  '--external:react', '--external:react-dom', '--external:react/jsx-runtime',
  '--external:react/jsx-dev-runtime', '--external:react-dom/client',
  `--banner:js=${banner}`, `--footer:js=${footer}`,
])

console.log('[dsh-paper-reader] built lib/index.js and lib/client.js via', bin)
