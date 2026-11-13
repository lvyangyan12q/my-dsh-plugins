import assert from 'node:assert/strict'
import { test } from 'node:test'
import { absoluteVaultPath, createNativeOpenSeam } from '../src/native-open.ts'

function remoteWith(overrides = {}) {
  return {
    session: {
      canOpenWorkspacePath: async () => ({ ok: true, value: true }),
      openWorkspacePath: async () => ({ ok: true, value: { opened: true } }),
      ...overrides,
    },
  }
}

test('公开 Remote 服务可用且宿主报告桌面打开能力时，原生打开可用', async () => {
  const calls = []
  const seam = createNativeOpenSeam(() => remoteWith({
    openWorkspacePath: async (request, signal) => {
      calls.push({ request, hasSignal: signal === undefined || signal instanceof AbortSignal })
      return { ok: true, value: { opened: true } }
    },
  }))
  assert.deepEqual(await seam.probe(), { available: true, reason: null })
  assert.deepEqual(await seam.open('D:/知识库/概率论/脉络.canvas'), { ok: true, reason: null })
  assert.deepEqual(calls, [{ request: { path: 'D:/知识库/概率论/脉络.canvas' }, hasSignal: true }])
})

test('缺少 Remote 或公开方法时诚实报告不可用，并拒绝调用', async () => {
  const missing = createNativeOpenSeam(() => undefined)
  const missingProbe = await missing.probe()
  assert.equal(missingProbe.available, false)
  assert.match(missingProbe.reason, /Remote/)
  assert.equal((await missing.open('D:/x.canvas')).ok, false)

  const partial = createNativeOpenSeam(() => ({ session: { canOpenWorkspacePath: async () => ({ ok: true, value: true }) } }))
  const partialProbe = await partial.probe()
  assert.equal(partialProbe.available, false)
  assert.match(partialProbe.reason, /openWorkspacePath/)

  const noSession = createNativeOpenSeam(() => ({}))
  assert.equal((await noSession.probe()).available, false)
})

test('宿主报告没有桌面打开方式时不可用；探测异常也转为原因而不是抛错', async () => {
  const disabled = createNativeOpenSeam(() => remoteWith({ canOpenWorkspacePath: async () => ({ ok: true, value: false }) }))
  const probe = await disabled.probe()
  assert.equal(probe.available, false)
  assert.match(probe.reason, /桌面|原生/)

  const failed = createNativeOpenSeam(() => remoteWith({ canOpenWorkspacePath: async () => ({ ok: false, error: { code: 'gateway/cancelled', message: 'cancelled' } }) }))
  assert.equal((await failed.probe()).available, false)

  const thrown = createNativeOpenSeam(() => remoteWith({ canOpenWorkspacePath: async () => { throw new Error('network down') } }))
  const thrownProbe = await thrown.probe()
  assert.equal(thrownProbe.available, false)
  assert.match(thrownProbe.reason, /network down/)
})

test('原生打开失败时保留宿主的真实原因，不伪装成成功', async () => {
  const refused = createNativeOpenSeam(() => remoteWith({
    openWorkspacePath: async () => ({ ok: false, error: { code: 'gateway/bad-request', message: 'Path has no verified Host path' } }),
  }))
  const result = await refused.open('D:/not-mapped.canvas')
  assert.equal(result.ok, false)
  assert.match(result.reason, /路径|Host|原生/i)

  const crashed = createNativeOpenSeam(() => remoteWith({
    openWorkspacePath: async () => { throw new Error('opener exploded') },
  }))
  const crashedResult = await crashed.open('D:/x.canvas')
  assert.equal(crashedResult.ok, false)
  assert.match(crashedResult.reason, /opener exploded/)
})

test('绝对知识库路径拼接不产生重复分隔符或穿越', () => {
  assert.equal(absoluteVaultPath('D:\\知识库\\', '/概率论/脉络.canvas'), 'D:/知识库/概率论/脉络.canvas')
  assert.equal(absoluteVaultPath('D:/知识库', '概率论/笔记/我的笔记.md'), 'D:/知识库/概率论/笔记/我的笔记.md')
  assert.equal(absoluteVaultPath('', '概率论/脉络.canvas'), null)
  assert.equal(absoluteVaultPath('D:/知识库', '../外面.canvas'), null)
})
