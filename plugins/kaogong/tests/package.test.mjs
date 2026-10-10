import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { npmCli } from '../../../scripts/release-tools.mjs'

test('package includes public client declarations, declares shared UI runtime and keeps Host workbench integration optional', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-personal-workbench'], 'file:../personal-workbench')
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-personal-workbench'), true)
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(bundle, /require\(["']@deepseek-ai\/dsh-personal-workbench/)
  const result = spawnSync(process.execPath, [npmCli(), 'pack', '--dry-run', '--json', '--ignore-scripts', '--offline', '--cache=lib/npm-cache'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const [pack] = JSON.parse(result.stdout)
  const files = pack.files.map(file => file.path)
  assert.equal(files.some(file => file.startsWith('lib/typecheck/')), false)
  assert.equal(files.some(file => /lib\/(?:runtime-|npm-cache)/.test(file)), false)
  for (const name of ['dsh-persona', 'dsh-skill-filesystem', 'dsh-tool-skill']) assert.equal(manifest.optionalDependencies[`@deepseek-ai/${name}`], '0.2.0-rc.2')
  for (const file of ['roles/personas/老师.md', 'roles/personas/班主任.md', 'roles/personas/辅导员.md', 'roles/skills/kaogong-teach/SKILL.md']) assert.ok(files.includes(file), file)
  const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  const chunk = host.match(/import\("\.\/(role-definitions-[^"]+\.mjs)"\)/)?.[1]
  assert.ok(chunk, 'Role declarations are an optional lazy module')
  assert.ok(files.includes(`lib/${chunk}`))
  assert.doesNotMatch(host, /from ["']@deepseek-ai\/dsh-persona/)
  for (const file of ['lib/client.js', 'lib/index.js', 'lib/types/client.d.ts', 'lib/types/view-state.d.ts', 'cordis.patch.yml']) assert.ok(files.includes(file), file)
  for (const file of ['lib/types/index.d.ts', 'lib/types/lessons.d.ts', 'lib/types/lesson-schema.d.ts']) assert.ok(files.includes(file), file)
  assert.equal(files.some(file => /^(src|scripts|tests)\//.test(file) || file.endsWith('.map') || file === 'roles/cordis.yml'), false)
  assert.match(readFileSync(new URL('../lib/types/client.d.ts', import.meta.url), 'utf8'), /KaogongViewProps/)
})
