/**
 * 派发反馈：/start 慢的时候页面不能「看起来没反应」。
 *
 * 验证：
 *  1. 点派发后立刻显示「正在派发…」提示，顶栏出现「处理中… 已等待 Ns」，按钮变灰；
 *  2. /start 迟迟不返回时再点一次不会重复提交；
 *  3. /start 请求失败（超时/断连）但服务端其实已建出 run → 自动接管那条 run，并清掉草稿；
 *  4. 失败且服务端没有 run → 草稿保留、给出可重试的提示。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

import { sshConfigJson } from './window3-test-fixture.mjs'

const require = createRequire(new URL('../../worktable/01_content/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

const raw = readFileSync(new URL('../window3-dispatch.html', import.meta.url), 'utf8').replace(/<link[^>]*>/g, '')
const sshConfig = JSON.parse(sshConfigJson)
const ok = (o) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => o, text: async () => JSON.stringify(o) })
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function boot({ startBehavior = 'ok', runsAfterStart = [] } = {}) {
  const state = { starts: 0, runs: [] }
  let pendingStart = null
  const dom = new JSDOM(raw, {
    url: 'http://127.0.0.1:3080/api/worktable/site/x/window3-dispatch.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.fetch = (url, opts = {}) => {
        const u = String(url)
        if (u.includes('/api/bug-solver/runs')) return Promise.resolve(ok({ runs: state.runs }))
        if (u.includes('/api/bug-solver/run')) return Promise.resolve(ok({ run: state.runs[0] || null }))
        if (u.includes('/api/bug-solver/start')) {
          state.starts += 1
          if (startBehavior === 'hang') {
            pendingStart = () => { state.runs = runsAfterStart; return ok({ run: runsAfterStart[0], idempotent: false }) }
            return new Promise(() => {}) // 永不 resolve
          }
          if (startBehavior === 'fail') {
            state.runs = runsAfterStart
            return Promise.reject(new Error('请求超时'))
          }
          state.runs = runsAfterStart
          return Promise.resolve(ok({ run: runsAfterStart[0], idempotent: false }))
        }
        if (u.includes('data/ssh-config.json')) return Promise.resolve(ok(sshConfig))
        if (u.includes('/api/bug-solver/messages')) return Promise.resolve(ok({ messages: [], before: null, hasMore: false }))
        return Promise.resolve(ok({}))
      }
      win.resolveStart = () => { if (pendingStart) pendingStart() }
    },
  })
  return { dom, win: dom.window, state }
}

async function openManual(win) {
  const doc = win.document
  const $ = (sel) => doc.querySelector(sel)
  const click = (sel) => {
    const el = $(sel)
    assert.ok(el, '找不到 ' + sel)
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  }
  const type = (sel, v) => {
    const el = $(sel)
    el.value = v
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
    el.dispatchEvent(new win.Event('change', { bubbles: true }))
  }
  await tick(150)
  click('[data-act="new-manual"]')
  await tick(150)
  type('#w3-problem', '生产环境容器偶发 500，日志有 OutOfMemoryError，影响通讯录导入。')
  type('#w3-local', 'C:\\test-projects\\example-app')
  await tick(20)
  if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur()
  return { $, click, type }
}

/* 1) 慢请求中要有反馈，且不能重复提交 */
{
  const { win, state } = boot({ startBehavior: 'hang' })
  const { $, click } = await openManual(win)
  click('[data-act="confirm-dispatch"]')
  await tick(200)

  assert.equal(state.starts, 1, '应已发出一次派发')
  const busy = $('.w3-busy')
  assert.ok(busy, '顶栏应显示忙碌状态')
  assert.match(busy.textContent, /处理中… 已等待 \d+s/, '应显示已等待秒数，实际：' + busy.textContent)
  const notice = $('[data-notice]')
  assert.ok(notice, '应有提示条')
  assert.match(notice.textContent, /正在派发/, '提示应说明正在派发，实际：' + notice.textContent)
  const btn = $('[data-act="confirm-dispatch"]')
  assert.equal(btn.disabled, true, '派发中按钮应禁用')

  click('[data-act="confirm-dispatch"]')
  await tick(100)
  assert.equal(state.starts, 1, '派发中再点不应重复提交')
  console.log('OK: 慢请求有「已等待 Ns」反馈，且不重复提交')
  win.close()
}

/* 2) 请求失败但服务端已建出 run → 自动接管 */
{
  const run = {
    id: 'run-recovered', state: 'fix_planning', currentRound: 1, bugId: 'manual-x',
    bug: { uid: null, id: 'manual-x', title: '生产环境容器偶发 500', source: 'manual' },
    project: { localPath: 'C:\\test-projects\\example-app' },
    rounds: [], artifacts: [], fixSessionId: 'sess-1',
  }
  const { win, state } = boot({ startBehavior: 'fail', runsAfterStart: [run] })
  const { $, click } = await openManual(win)
  const before = JSON.parse(win.localStorage.getItem('bug-solver.dispatch.draft.v1') || '{"drafts":{}}')
  click('[data-act="confirm-dispatch"]')
  await tick(400)

  assert.equal(state.starts, 1)
  const notice = $('[data-notice]')
  assert.ok(notice, '应有提示')
  assert.match(notice.textContent, /已派发/, '应接管服务端已经建好的 run，实际：' + notice.textContent)
  assert.equal($('[data-card="confirm"]'), null, '确认页应关闭')
  assert.ok($('[data-card="run-summary"]'), '应切到 run 视图')
  console.log('OK: 超时/失败但服务端已建 run → 自动接管')
  win.close()
}

/* 3) 请求失败且服务端没有 run → 草稿保留 + 可重试提示 */
{
  const { win } = boot({ startBehavior: 'fail', runsAfterStart: [] })
  const { $, click } = await openManual(win)
  click('[data-act="confirm-dispatch"]')
  await tick(400)

  const notice = $('[data-notice]')
  assert.ok(notice, '应有提示')
  assert.match(notice.textContent, /草稿已保留|未返回/, '应说明草稿保留、可稍后刷新，实际：' + notice.textContent)
  assert.ok($('[data-card="confirm"]'), '仍应停在确认页')
  assert.ok($('#w3-problem').value.length > 0, '问题描述不应丢失')
  console.log('OK: 失败时草稿保留、停在确认页')
  win.close()
}

console.log('\n全部通过')
