import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, symlink, cp, writeFile, realpath, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname, relative, isAbsolute } from 'node:path'
import { runNode } from './release-tools.mjs'

/** The products come only from the installed pair; first-party types use the same built CLI installation anchor. */
export async function checkInstalledTypes(home, source, root, env) {
  home = resolve(home); source = resolve(source); root = resolve(root)
  const consumer = await mkdtemp(join(root, 'type-consumer-'))
  const modules = join(consumer, 'node_modules')
  await mkdir(join(modules, '@deepseek-ai'), { recursive: true }); await mkdir(join(modules, '@types'), { recursive: true })
  const link = async (target, path) => {
    try { await symlink(target, path, 'junction') }
    catch (error) { if (error.code !== 'EEXIST') throw error; assert.equal(await realpath(path), await realpath(target), 'Retry cannot substitute an existing dependency') }
  }
  const installed = createRequire(join(home, 'package.json'))
  for (const name of ['dsh-personal-workbench', 'dsh-tool-kaogong']) {
    const packageRoot = dirname(installed.resolve(`@deepseek-ai/${name}/package.json`))
    const rel = relative(root, await realpath(packageRoot))
    assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Products must be installed in this owned home')
    await cp(packageRoot, join(modules, '@deepseek-ai', name), { recursive: true, filter: path => !relative(packageRoot, path).split(/[\\/]/).includes('node_modules') })
  }
  // rc.2 supplies first-party services from its install anchor, not profile dependencies.
  // Expose their real built package exports for NodeNext, without src/lib tsconfig path mappings.
  const folders = [join(source, 'vendor')]
  for (const group of await readdir(join(source, 'packages'), { withFileTypes: true })) if (group.isDirectory()) folders.push(join(source, 'packages', group.name))
  for (const folder of folders) for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packageRoot = join(folder, entry.name)
    let manifest
    try { manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (!manifest.name?.startsWith('@deepseek-ai/') || !manifest.exports?.['.']?.types || manifest.name === '@deepseek-ai/schemastery') continue
    assert(manifest.version === '0.2.0-rc.2' || !manifest.name.startsWith('@deepseek-ai/dsh-'), 'First-party type anchor must match rc.2')
    await link(packageRoot, join(modules, ...manifest.name.split('/')))
  }
  const require = createRequire(join(source, 'packages/client/ui-renderer/package.json'))
  for (const name of ['react', '@types/react', '@types/node']) await link(dirname(require.resolve(name + '/package.json')), join(modules, ...name.split('/')))
  for (const name of ['zod', '@deepseek-ai/schemastery']) await link(dirname(installed.resolve(name + '/package.json')), join(modules, ...name.split('/')))
  await cp(new URL('../tests/installed-consumer.ts', import.meta.url), join(consumer, 'consumer.mts'))
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n')
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, jsx: 'react-jsx', types: ['node'], lib: ['ES2024', 'DOM', 'DOM.Iterable', 'ESNext.Disposable'] }, include: ['consumer.mts'] }))
  await runNode([resolve(source, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')], { cwd: consumer, env })
}
