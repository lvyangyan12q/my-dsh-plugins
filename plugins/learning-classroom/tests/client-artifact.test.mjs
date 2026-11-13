import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)

test('客户端产物用公开 module loader 注册，并导出侧栏与主面板入口', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/client.tsx', import.meta.url))],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
    banner: { js: 'window.__ModuleLoader__.load({id:"@deepseek-ai/dsh-learning-classroom",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
    footer: { js: 'return module.exports;}});' },
  })
  const code = bundle.outputFiles[0].text
  assert.doesNotMatch(code, /require\("node:/)
  let loaded
  runInNewContext(code, {
    window: { __ModuleLoader__: { load: entry => { loaded = { id: entry.id, exports: entry.factory(require) } } } },
    require,
    console,
  })
  assert.equal(loaded.id, '@deepseek-ai/dsh-learning-classroom')
  assert.equal(loaded.exports.panelId, 'learning-classroom')
  assert.equal(typeof loaded.exports.apply, 'function')
  assert.equal(typeof loaded.exports.ClassroomPanel, 'function')
})

test('数学渲染复用宿主公开 client primitives，并声明注入而非另装 KaTeX 依赖', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-primitives'])
  assert.equal(pkg.dependencies.katex, undefined)
  assert.equal(pkg.dependencies.mathjax, undefined)

  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/client.tsx', import.meta.url))],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  })
  const code = bundle.outputFiles[0].text
  // The platform package stays an external lookup; it is never bundled into the
  // plugin, and the deferred require keeps activation alive on hosts without it.
  assert.match(code, /@deepseek-ai\/dsh-client-ui-primitives/)
  assert.doesNotMatch(code, /katex\.min\.css/)
})
