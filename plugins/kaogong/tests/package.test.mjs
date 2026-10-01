import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('package includes emitted client declarations and keeps workbench runtime optional', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.peerDependenciesMeta['@deepseek-ai/dsh-personal-workbench'].optional, true)
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-personal-workbench'), false)
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(bundle, /require\(["']@deepseek-ai\/dsh-personal-workbench/)
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache=lib/npm-cache'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
  assert.equal(result.status, 0, result.stderr)
  const [pack] = JSON.parse(result.stdout)
  const files = pack.files.map(file => file.path)
  for (const name of ['dsh-persona', 'dsh-skill-filesystem', 'dsh-tool-skill']) assert.equal(manifest.optionalDependencies[`@deepseek-ai/${name}`], '0.2.0-rc.2')
  for (const file of ['roles/personas/老师.md', 'roles/personas/班主任.md', 'roles/personas/辅导员.md', 'roles/skills/kaogong-teach/SKILL.md']) assert.ok(files.includes(file), file)
  const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  const chunk = host.match(/import\("\.\/(role-definitions-[^"]+\.mjs)"\)/)?.[1]
  assert.ok(chunk, 'Role declarations are an optional lazy module')
  assert.ok(files.includes(`lib/${chunk}`))
  assert.doesNotMatch(host, /from ["']@deepseek-ai\/dsh-persona/)
  for (const file of ['lib/client.js', 'lib/index.js', 'lib/types/client.d.ts', 'lib/types/view-state.d.ts', 'cordis.patch.yml']) assert.ok(files.includes(file), file)
  assert.match(readFileSync(new URL('../lib/types/client.d.ts', import.meta.url), 'utf8'), /KaogongViewProps/)
})
