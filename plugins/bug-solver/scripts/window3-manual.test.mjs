/**
 * 窗口3「自由输入分析」冒烟测试（jsdom 直接跑真实页面）。
 *
 * 验证：
 *  1) 空态有「分析一个问题」入口，点击后出现问题标题/问题描述输入框；
 *  2) 只填描述（标题留空）也能通过校验，派发载荷里 bug.source === 'manual'、
 *     bug.id 以 manual- 开头、bug.title 自动取描述首行、description 原文带上；
 *  3) 桥 /start 收到的是标准 DispatchDraft（连接/仓库/spec 字段齐全）。
 *
 * 用法：node scripts/window3-manual.test.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

import { sshConfigJson } from './window3-test-fixture.mjs'

const require = createRequire(new URL('../../worktable/01_content/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

const page = readFileSync(new URL('../window3-dispatch.html', import.meta.url), 'utf8')
const sshConfig = sshConfigJson
const html = page.replace(/<link[^>]*>/g, '')

const sent = []
const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:3080/api/worktable/site/x/window3-dispatch.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.fetch = async (url, opts = {}) => {
      const u = String(url)
      if (u.includes('/api/bug-solver/runs')) return jsonRes({ runs: [] })
      if (u.includes('data/ssh-config.json')) return jsonRes(JSON.parse(sshConfig))
      if (u.includes('/api/bug-solver/start')) {
        const body = opts.body ? JSON.parse(opts.body) : null
        sent.push(body)
        return jsonRes({ run: { id: 'run-test', state: 'confirmed', bug: body && body.bug, currentRound: 1, rounds: [] } })
      }
      if (u.includes('/api/bug-solver/run')) return jsonRes({ run: null })
      return new (win.Response || Object)(null) // 未处理的路由：保持失败
    }
  },
})
function jsonRes(obj) {
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => obj, text: async () => JSON.stringify(obj) }
}

const win = dom.window
const doc = win.document
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
const $ = (sel) => doc.querySelector(sel)
const click = (sel) => { const el = $(sel); assert.ok(el, '找不到 ' + sel); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) }
const type = (sel, value) => {
  const el = $(sel)
  assert.ok(el, '找不到 ' + sel)
  el.value = value
  el.dispatchEvent(new win.Event('input', { bubbles: true }))
  el.dispatchEvent(new win.Event('change', { bubbles: true }))
}

await tick(120)

// 1) 空态入口
assert.ok($('[data-card="empty"]'), '空态卡片应存在（runs 为空）')
assert.ok($('[data-act="new-manual"]'), '空态应有「分析一个问题」按钮')
click('[data-act="new-manual"]')
await tick(150)

// 2) 自由输入表单
const problem = $('#w3-problem')
assert.ok(problem, '应出现问题描述输入框')
assert.ok($('#w3-problemTitle'), '应出现问题标题输入框')
console.log('OK: 自由输入表单已渲染')

// 3) 只填描述（标题留空）+ 补齐仓库/连接
const desc = '示例环境 192.0.2.10 上 example-app 容器偶发 500，日志里有 OutOfMemoryError，影响通讯录导入。'
type('#w3-problem', desc)
type('#w3-local', 'C:\\test-projects\\example-app')
await tick(20)

const checks = [...doc.querySelectorAll('[data-validation] [data-check]')].map((el) => ({
  k: el.getAttribute('data-check'), ok: el.getAttribute('data-ok') === '1',
}))
const bad = checks.filter((c) => !c.ok)
console.log('checks:', checks.map((c) => c.k + '=' + (c.ok ? '1' : '0')).join(' '))
assert.deepEqual(bad.map((b) => b.k), [], '填完描述+仓库后不应还有未通过项')

const dispatch = $('[data-act="confirm-dispatch"]')
assert.ok(dispatch && !dispatch.disabled, '确认并派发应可点')
click('[data-act="confirm-dispatch"]')
await tick(200)

// 4) 校验派发载荷
assert.equal(sent.length, 1, '应发出一次 /start 请求')
const draft = sent[0]
assert.equal(draft.bug.source, 'manual', 'bug.source 应为 manual')
assert.ok(/^manual-\d{8}-\d{6}$/.test(draft.bug.id), 'bug.id 应为 manual-<日期>-<时间>，实际 ' + draft.bug.id)
assert.equal(draft.bug.uid, null, '自由输入不应伪造缺陷号')
assert.equal(draft.bug.description, desc, '描述原文应进入载荷')
assert.ok(draft.bug.title && draft.bug.title.startsWith('示例环境'), '标题留空时应取描述首行，实际 ' + JSON.stringify(draft.bug.title))
assert.ok(draft.connection && draft.connection.host && draft.connection.user, 'SSH 连接应带出（来自窗口2 的 ssh-config）')
assert.ok(draft.connection.keyPath, 'SSH 连接应带 keyPath')
assert.equal(draft.project.localPath, 'C:\\test-projects\\example-app', '仓库路径应进入载荷')
assert.ok(draft.specRef && draft.specRef.kind === 'none', 'spec 默认 none')
console.log('OK: 派发载荷合理')
console.log('  bug:', JSON.stringify({ id: draft.bug.id, source: draft.bug.source, title: draft.bug.title.slice(0, 24) + '…' }))
console.log('  conn:', draft.connection.name, draft.connection.user + '@' + draft.connection.host)
console.log('  repo:', draft.project.localPath)
console.log('\n全部通过')
win.close()
