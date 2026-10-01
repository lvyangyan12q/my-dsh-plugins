import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Archive/anchor inspection is deliberately separate from actual tarball installation.
const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const runtime = ['dsh-storage-domain'].map(name => `@deepseek-ai/${name}`)
for (const name of runtime) assert.equal(manifest.optionalDependencies[name], '0.2.0-rc.2')
assert.ok(manifest.dependencies.zod)
const packed = spawnSync('npm.cmd', ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', resolve(root, '.checks/npm-cache')], { cwd: root, shell: true, encoding: 'utf8', timeout: 30000 })
assert.equal(packed.status, 0, packed.stderr)
const files = JSON.parse(packed.stdout)[0].files.map(file => file.path)
assert.ok(!files.includes('skills/kaogong-teach/SKILL.md'), 'Teaching rules belong to the application package')
assert.ok(files.includes('lib/types/role-binding-api.d.ts'))
const host = await readFile(resolve(root, 'lib/index.js'), 'utf8')
const chunk = host.match(/import\("\.\/(role-host-[^"]+\.mjs)"\)/)?.[1]
assert.ok(chunk, 'Optional role module must remain a lazy chunk')
assert.ok(files.includes(`lib/${chunk}`), 'Lazy chunk must be in the archive')
const managementChunk = host.match(/import\("\.\/(management-host-[^"]+\.mjs)"\)/)?.[1]
assert.ok(managementChunk, 'Management stays optional and lazy')
assert.ok(files.includes(`lib/${managementChunk}`), 'Management lazy chunk must ship')
for (const file of ['management-api', 'management-domain', 'management-host', 'management-runtime']) assert.ok(files.includes(`lib/types/${file}.d.ts`))
assert.ok(!files.some(file => file.startsWith('tests/fixtures/')), 'Synthetic catalog fixtures must never ship')
assert.ok(!host.includes('from "@deepseek-ai/dsh-storage-domain"'), 'Base Host must not eagerly import optional helpers')
const require = createRequire(resolve(root, 'package.json'))
const resolutions = runtime.map(name => ({ name, resolved: require.resolve(name), declared: manifest.optionalDependencies[name] }))
console.log(JSON.stringify({ archiveBoundary: 'passed', runtimeDependencies: resolutions,
  note: 'These local resolution anchors may be source junctions; they do not establish tarball installation. Ticket 11 actual installed dependency/import/preset gates remain pending.' }, null, 2))
