import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { npmCli, runNode } from './release-tools.mjs'

export async function packRelease(packageRoot, output, env) {
  await mkdir(output, { recursive: true })
  const options = ['--json', '--ignore-scripts', '--offline', '--cache', join(output, 'npm-cache')]
  const dry = JSON.parse(await runNode([npmCli(), 'pack', '--dry-run', ...options], { cwd: packageRoot, env }))[0]
  const pack = JSON.parse(await runNode([npmCli(), 'pack', '--pack-destination', output, ...options], { cwd: packageRoot, env }))[0]
  assert.deepEqual(pack.files.map(row => row.path).sort(), dry.files.map(row => row.path).sort())
  const archive = join(output, pack.filename)
  const tar = createRequire(npmCli())('tar')
  const files = []
  await tar.t({ file: archive, onReadEntry: entry => { if (entry.type === 'File') files.push(entry.path.replace(/^package\//, '')) } })
  assert.deepEqual(files.sort(), pack.files.map(row => row.path).sort(), 'Actual archive must match inspected listing')
  for (const file of files) {
    assert(!file.startsWith('/') && !file.split('/').includes('..'), 'Unsafe archive member')
    assert(!/\.map$|\.pdf$|(?:^|\/)(?:\.env|\.checks|\.scratch|node_modules|typecheck|runtime-[^/]*|npm-cache)(?:\/|$)|^(?:src|tests|scripts)\//i.test(file), `Forbidden release file: ${file}`)
    assert.notEqual(file, 'roles/cordis.yml')
    if (file.startsWith('data/')) assert(['data/sample-bank.json', 'data/sample-knowledge.json', 'data/sample-questions.json'].includes(file))
    if (file.endsWith('.d.ts')) assert(!/(?:[A-Z]:[\\/]|\.pnpm\/)/.test(await readFile(resolve(packageRoot, file), 'utf8')), `Nonportable declaration: ${file}`)
  }
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  for (const target of Object.values(manifest.exports)) for (const file of typeof target === 'string' ? [target] : Object.values(target)) assert(files.includes(file.replace(/^\.\//, '')), `Missing export ${file}`)
  const reachable = new Set(['lib/index.js', 'lib/client.js'])
  const visit = async file => {
    const text = await readFile(join(packageRoot, file), 'utf8')
    for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*)["']\.\/([^"']+\.mjs)["']/g)) {
      const dependency = 'lib/' + match[1]
      assert(files.includes(dependency), `Missing chunk ${dependency}`)
      if (!reachable.has(dependency)) { reachable.add(dependency); await visit(dependency) }
    }
  }
  await visit('lib/index.js'); await visit('lib/client.js')
  for (const file of files.filter(file => /^lib\/[^/]+\.(?:mjs|js)$/.test(file))) assert(reachable.has(file), `Stale/unreferenced runtime output ${file}`)
  return { archive, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files }
}
