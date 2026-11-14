/**
 * 日志时间窗：滚动窗口不能冻结在草稿创建时刻。
 *
 * 验证：
 *  1. 默认「最近 3 天」派发时，payload.timeWindow = {mode:'rolling', hours:72, from≈now-72h, to≈now}；
 *  2. 草稿放久一点（模拟创建于 2 天前），派发时间窗仍然按当下计算，不是创建时刻；
 *  3. 切到「最近 1 天」→ 24 小时；切「自定义」后可手填，并按填写值派发；
 *  4. 旧草稿（timeWindow 里没有 mode，只有绝对 from/to）→ 按滚动处理，不再显示过期窗口。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

import { sshConfigJson } from './window3-test-fixture.mjs'

const require = createRequire(new URL('../../worktable/01_content/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

const raw = readFileSync(new URL('../window3-dispatch.html', import.meta.url), 'utf8').replace(/<link[^>]*>/g, '')
const sshConfig = JSON.parse(sshConfigJson)
const HOUR = 3600 * 1000

function boot(storageSeed) {
  const sent = []
  const ok = (o) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => o, text: async () => JSON.stringify(o) })
  const dom = new JSDOM(raw, {
    url: 'http://127.0.0.1:3080/api/worktable/site/x/window3-dispatch.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      if (storageSeed) for (const [k, v] of Object.entries(storageSeed)) win.localStorage.setItem(k, v)
      win.fetch = async (url, opts = {}) => {
        const u = String(url)
        if (u.includes('/api/bug-solver/runs')) return ok({ runs: [] })
        if (u.includes('/api/bug-solver/run')) return ok({ run: null })
        if (u.includes('/api/bug-solver/start')) { sent.push(JSON.parse(opts.body || '{}')); return ok({ run: { id: 'run-x', state: 'confirmed', bug: JSON.parse(opts.body || '{}').bug, rounds: [] } }) }
        if (u.includes('data/ssh-config.json')) return ok(sshConfig)
        if (u.includes('/api/bug-solver/messages')) return ok({ messages: [], before: null, hasMore: false })
        return ok({})
      }
    },
  })
  return { dom, win: dom.window, sent }
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function helpers(win) {
  const doc = win.document
  const $ = (sel) => doc.querySelector(sel)
  const type = (sel, value) => {
    const el = $(sel)
    assert.ok(el, '找不到 ' + sel)
    el.value = value
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
    el.dispatchEvent(new win.Event('change', { bubbles: true }))
  }
  const click = (sel) => {
    const el = $(sel)
    assert.ok(el, '找不到 ' + sel)
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  }
  const blur = () => { if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur() }
  return { $, type, click, blur }
}

/* 1) 默认：最近 3 天滚动 */
{
  const { win, sent } = boot(null)
  await tick(150)
  const { $, type, click, blur } = helpers(win)
  click('[data-act="new-manual"]')
  await tick(150)
  type('#w3-problem', '生产环境容器偶发 500，日志有 OutOfMemoryError，影响通讯录导入。')
  type('#w3-local', 'C:\\test-projects\\example-app')
  await tick(20)

  // 滚动模式下起止输入是禁用的
  assert.equal($('#w3-from').disabled, true, '滚动窗口下起止应禁用（自动计算）')
  assert.equal($('#w3-window').value, '3d', '默认预设应为 3d')

  blur()
  click('[data-act="confirm-dispatch"]')
  await tick(200)
  assert.equal(sent.length, 1, '应发出一次 /start')
  const tw = sent[0].timeWindow
  assert.equal(tw.mode, 'rolling', '应为滚动窗口')
  assert.equal(tw.hours, 72)
  const before = Date.now()
  const to = new Date(tw.to).getTime()
  const from = new Date(tw.from).getTime()
  assert.ok(Math.abs(before - to) < 90 * 1000, '结束时间应≈现在，实际差 ' + Math.round((before - to) / 1000) + 's')
  assert.equal(to - from, 72 * HOUR, '窗口长度应为 72 小时')
  console.log('OK: 默认滚动窗口 = now-72h ~ now')
  win.close()
}

/* 2) 旧草稿（只有绝对 from/to，创建于 2 天前）→ 仍按当下滚动 */
{
  const twoDaysAgo = Date.now() - 2 * 24 * HOUR
  const draft = {
    version: 1, status: 'pending', createdAt: new Date(twoDaysAgo).toISOString(), updatedAt: new Date(twoDaysAgo).toISOString(),
    runId: 'run-old', bug: { id: 'BUG-1', uid: 1, title: '旧草稿' },
    connection: { id: 'c1', name: 't', host: '192.0.2.10', port: '22', user: 'test-user', keyPath: 'C:\\test-keys\\id_ed25519' },
    project: { localPath: 'C:\\test-projects\\example-app', baseBranch: 'master' },
    specRef: { kind: 'none' }, container: '', notes: '',
    timeWindow: { from: new Date(twoDaysAgo - 72 * HOUR).toISOString(), to: new Date(twoDaysAgo).toISOString() },
    source: { window: '窗口1', pane: 'p1' },
  }
  const seed = { 'bug-solver.dispatch.draft.v1': JSON.stringify({ version: 1, updatedAt: draft.updatedAt, drafts: { 'BUG-1': draft } }) }
  const { win, sent } = boot(seed)
  await tick(200)
  const { $, click, blur } = helpers(win)
  assert.ok($('[data-card="confirm"]'), '应回到旧草稿的确认页')
  assert.equal($('#w3-window').value, '3d', '旧草稿应按 3d 滚动')
  const shown = $('#w3-from').value
  const shownTs = new Date(shown).getTime()
  const expectFrom = Date.now() - 72 * HOUR
  assert.ok(Math.abs(shownTs - expectFrom) < 5 * 60 * 1000, '展示的起始时间应是「现在-72h」，实际差 ' + Math.round((shownTs - expectFrom) / 60000) + ' 分钟')
  assert.ok(shownTs > twoDaysAgo - 72 * HOUR + HOUR, '不能沿用草稿里 5 天前的旧时间')
  blur()
  click('[data-act="confirm-dispatch"]')
  await tick(200)
  assert.equal(sent.length, 1)
  const tw = sent[0].timeWindow
  assert.equal(tw.mode, 'rolling')
  assert.ok(Math.abs(new Date(tw.to).getTime() - Date.now()) < 90 * 1000, '旧草稿派发时也按当下计算')
  console.log('OK: 旧草稿不再带过期窗口')
  win.close()
}

/* 3) 切预设 / 自定义 */
{
  const { win, sent } = boot(null)
  await tick(150)
  const { $, type, click, blur } = helpers(win)
  click('[data-act="new-manual"]')
  await tick(150)
  type('#w3-problem', '接口偶发超时，怀疑连接池泄漏，需要只读排查。')
  type('#w3-local', 'C:\\test-projects\\example-app')
  await tick(20)

  // 切「最近 1 天」
  blur()  // 真实点击下拉会先让文本框失焦
  const sel = $('#w3-window')
  sel.value = '1d'
  sel.dispatchEvent(new win.Event('change', { bubbles: true }))
  await tick(80)
  assert.equal($('#w3-window').value, '1d')
  assert.equal($('#w3-from').disabled, true, '仍是滚动模式')

  blur()
  click('[data-act="confirm-dispatch"]')
  await tick(200)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].timeWindow.hours, 24, '应为 24 小时')
  console.log('OK: 切「最近 1 天」= 24h')
  win.close()
}

{
  const { win, sent } = boot(null)
  await tick(150)
  const { $, type, click, blur } = helpers(win)
  click('[data-act="new-manual"]')
  await tick(150)
  type('#w3-problem', '手工指定时间窗的场景：只要某一天凌晨的日志。')
  type('#w3-local', 'C:\\test-projects\\example-app')
  await tick(20)

  blur()  // 真实点击下拉会先让文本框失焦
  const sel = $('#w3-window')
  sel.value = 'custom'
  sel.dispatchEvent(new win.Event('change', { bubbles: true }))
  await tick(80)
  assert.equal($('#w3-from').disabled, false, '自定义模式起止应可编辑')

  type('#w3-from', '2026-11-01T00:00')
  type('[data-field="to"]', '2026-11-01T06:00')
  await tick(20)
  blur()
  click('[data-act="confirm-dispatch"]')
  await tick(200)
  assert.equal(sent.length, 1)
  const tw = sent[0].timeWindow
  assert.equal(tw.mode, 'custom', '应保存为自定义')
  assert.equal(new Date(tw.to).getTime() - new Date(tw.from).getTime(), 6 * HOUR, '应按填写值派发')
  console.log('OK: 自定义窗口按填写值派发')
  win.close()
}

console.log('\n全部通过')
