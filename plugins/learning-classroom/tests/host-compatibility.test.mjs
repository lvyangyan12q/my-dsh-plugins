import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The running official DSH decides whether a plugin may install and activate
 * from its manifest alone: `evaluatePluginCompatibility` prefers an own
 * `engines.dsh` range and otherwise checks every `@deepseek-ai/dsh*` peer.
 *
 * Importing that real evaluator instead of re-implementing SemVer keeps these
 * tests honest about what the Host will accept, and the runtime version comes
 * from the Host itself rather than from a hard-coded expectation that would
 * drift with the next release.
 *
 * `DSH_SOURCE` names an already-built official checkout, the same selector the
 * repository's other installed-runtime checks use.
 */
const source = process.env.DSH_SOURCE
const skip = source === undefined || source === ''
  ? 'set DSH_SOURCE to an already-built official DSH checkout to evaluate host compatibility'
  : false

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

async function hostContract() {
  const entry = pathToFileURL(join(source, 'packages/boot/app-boot/lib/index.js')).href
  const module = await import(entry)
  return { evaluate: module.evaluatePluginCompatibility, runtime: module.getDshRuntimeVersion() }
}

test('插件引擎声明接受真实运行宿主', { skip }, async () => {
  const { evaluate, runtime } = await hostContract()
  assert.match(runtime, /^\d+\.\d+\.\d+-?/, '宿主应报告语义化版本')
  const unmet = evaluate(manifest, {}, runtime)
  assert.equal(
    unmet,
    undefined,
    `运行宿主 ${runtime} 不满足插件声明：${JSON.stringify(unmet?.requirements)}；请把 engines.dsh 改成覆盖当前宿主的范围`,
  )
})

test('插件宿主 peer 声明接受真实运行宿主，而不是钉死旧版本', { skip }, async () => {
  const { evaluate, runtime } = await hostContract()
  // Without an own engines.dsh the same public evaluator checks every dsh peer,
  // which is the other way a manifest can reject the running Host.
  const unmet = evaluate({ ...manifest, engines: {} }, {}, runtime)
  assert.equal(
    unmet,
    undefined,
    `运行宿主 ${runtime} 不满足插件 peer 声明：${JSON.stringify(unmet?.requirements)}；请把 dsh peer 改成覆盖当前宿主的范围`,
  )
})
