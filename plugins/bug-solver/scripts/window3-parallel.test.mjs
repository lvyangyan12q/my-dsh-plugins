/**
 * 窗口3「并行会话管理」冒烟测试（jsdom 跑真实页面，假桥返回 4 条 run）。
 *
 * 验证：
 *  1. 顶栏「并行会话」页签 + 待你处理数量角标；
 *  2. 会话板按「待你处理 / 进行中 / 已结束」分组，卡片数与 run 数一致；
 *  3. 点卡片切换 run（不影响其它 run），自由输入 run 显示为「自由输入」；
 *  4. 右栏运行队列排序：待处理在前；
 *  5. 确认页在「同仓库已有活跃 run」时预警，并给「先看那条」跳转。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

import { sshConfigJson } from './window3-test-fixture.mjs'

const require = createRequire(new URL('../../worktable/01_content/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

const page = readFileSync(new URL('../window3-dispatch.html', import.meta.url), 'utf8').replace(/<link[^>]*>/g, '')
const sshConfig = JSON.parse(sshConfigJson)

const now = Date.now()
const mk = (o) => ({ createdAt: now - 9e6, ...o })
const RUNS = [
  mk({
    id: 'run-attn', state: 'awaiting_plan_approval', currentRound: 2, bugId: '695b0001', bugUid: 3083,
    bug: { uid: 3083, id: '695b0001', title: '访客登记失败' },
    project: { localPath: 'C:\\test-projects\\example-app' }, branch: 'bugfix/3083-a',
    worktree: { path: 'C:\\test-projects\\example-app\\.bug-solver\\worktrees\\runattn001', branch: 'bugfix/3083-a', baseBranch: 'master' },
    fixSessionId: 'sess-fix-1', reviewSessionId: 'sess-rev-1', updatedAt: now - 6 * 60000,
  }),
  mk({
    id: 'run-manual', state: 'fix_implementing', currentRound: 1, bugId: 'manual-20261110-100000', bugUid: null,
    bug: { uid: null, id: 'manual-20261110-100000', title: '通讯录导入偶发 500', source: 'manual' },
    project: { localPath: 'C:\\test-projects\\example-app' }, branch: 'bugfix/manual-1',
    fixSessionId: 'sess-fix-2', reviewSessionId: null, updatedAt: now - 40 * 60000,
  }),
  mk({
    id: 'run-other', state: 'review_running', currentRound: 1, bugId: '695b0003', bugUid: 3090,
    bug: { uid: 3090, id: '695b0003', title: '导出乱码' },
    project: { localPath: 'C:\\test-projects\\other-app' }, branch: 'bugfix/3090-a',
    fixSessionId: 'sess-fix-3', reviewSessionId: 'sess-rev-3', updatedAt: now - 3 * 3600e3,
  }),
  mk({
    id: 'run-done', state: 'approved', currentRound: 1, bugId: '695b0004', bugUid: 3091,
    bug: { uid: 3091, id: '695b0004', title: '已完成的' },
    project: { localPath: 'C:\\test-projects\\other-app' }, branch: 'bugfix/3091-a',
    fixSessionId: 'sess-fix-4', reviewSessionId: 'sess-rev-4', updatedAt: now - 26 * 3600e3,
  }),
]

const ok = (o) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => o, text: async () => JSON.stringify(o) })
let currentId = 'run-attn'

const dom = new JSDOM(page, {
  url: 'http://127.0.0.1:3080/api/worktable/site/x/window3-dispatch.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.fetch = async (url) => {
      const u = String(url)
      if (u.includes('/api/bug-solver/runs')) return ok({ runs: RUNS })
      if (u.includes('/api/bug-solver/run')) {
        const id = new win.URL(u, 'http://x').searchParams.get('id') || currentId
        const found = RUNS.find((r) => r.id === id)
        currentId = found ? found.id : currentId
        return ok({ run: found || RUNS[0] })
      }
      if (u.includes('data/ssh-config.json')) return ok(sshConfig)
      if (u.includes('/api/bug-solver/messages')) return ok({ messages: [], before: null, hasMore: false })
      return ok({})
    }
  },
})
const win = dom.window
const doc = win.document
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
const $ = (sel) => doc.querySelector(sel)
const $$ = (sel) => [...doc.querySelectorAll(sel)]
function click(sel) {
  const el = $(sel)
  assert.ok(el, '找不到 ' + sel)
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
}
const type = (sel, value) => {
  const el = $(sel)
  assert.ok(el, '找不到 ' + sel)
  el.value = value
  el.dispatchEvent(new win.Event('input', { bubbles: true }))
  el.dispatchEvent(new win.Event('change', { bubbles: true }))
}

await tick(250)

/* 1) 页签 + 角标 */
const tab = $('[data-view="sessions"]')
assert.ok(tab, '应有「并行会话」页签')
assert.equal((tab.querySelector('.w3-tabDot') || {}).textContent, '1', '待你处理角标应为 1（只有 awaiting_plan_approval）')
console.log('OK: 并行会话页签 + 角标 = 1')

/* 2) 会话板分组与卡片 */
click('[data-view="sessions"]')
await tick(60)
assert.ok($('[data-board]'), '应渲染会话板')
const secs = $$('.w3-boardSec').map((el) => el.getAttribute('data-board-sec'))
assert.deepEqual(secs, ['待你处理', '进行中', '已结束'], '分组应为 待你处理/进行中/已结束，实际 ' + secs.join(','))
const cards = $$('.w3-runCard')
assert.equal(cards.length, 4, '4 条 run → 4 张卡，实际 ' + cards.length)
const cardText = cards.map((c) => c.textContent.replace(/\s+/g, ' '))
assert.ok(cardText.some((t) => t.includes('自由输入') && t.includes('通讯录导入偶发 500')), '自由输入 run 应显示为「自由输入 · 标题」')
assert.ok(cardText.some((t) => t.includes('example-app')), '卡片应显示仓库名')
assert.equal($$('[data-needs-me="1"].w3-runCard').length, 1, '只有 1 张卡标记待处理')
console.log('OK: 会话板 3 组 / 4 卡；自由输入与仓库名都正确')

/* 3) 点卡片切换 run */
const otherCard = cards.find((c) => c.getAttribute('data-run-id') === 'run-other')
otherCard.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
await tick(200)
assert.equal(doc.getElementById('app').getAttribute('data-view'), 'task', '切换后应回到任务视图')
assert.ok($('[data-card="run-summary"]'), '应显示切过去那条 run 的摘要')
assert.ok(doc.body.textContent.includes('BUG-3090'), '摘要应属于 run-other（BUG-3090），实际不含')
assert.equal(currentId, 'run-other', '应真正加载了 run-other')
console.log('OK: 卡片切换 run（run-other）')

/* 4) 右栏队列排序：待处理在前 */
const railNames = $$('[data-card="runs"] .w3-runItem').map((b) => b.getAttribute('data-run-id'))
assert.equal(railNames.length, 4, '右上队列应有 4 条')
assert.equal(railNames[0], 'run-attn', '待处理应排第一，实际 ' + railNames[0])
assert.ok($$('[data-card="runs"] .w3-needDot').length === 1, '队列应只有 1 个待处理标记')
console.log('OK: 右栏队列排序正确 →', railNames.join(' > '))

/* 5) 确认页：同仓库已有活跃 run 只是说明（可并行），不再阻断 */
click('[data-act="new-manual"]')
await tick(150)
assert.ok($('#w3-problem'), '应进入自由输入确认页')
assert.equal($('[data-same-repo="1"]'), null, '仓库空时不应出说明')
type('#w3-local', 'C:\\test-projects\\example-app')
await tick(30)
const sameRepo = $('[data-same-repo="1"]')
assert.ok(sameRepo, '同仓库有活跃 run 时应给出并行说明')
assert.ok(sameRepo.textContent.includes('另开独立工作区'), '文案要说明会另开工作区，实际：' + sameRepo.textContent)
assert.equal($('[data-repo-busy="1"]'), null, '不应再出现阻断式预警')
const jump = sameRepo.querySelector('[data-act="select-run"]')
assert.ok(jump && jump.getAttribute('data-run-id'), '说明里应带「先看那条」跳转')
console.log('OK: 同仓库并行说明 + 跳转（' + jump.getAttribute('data-run-id') + '）')

/* 确认按钮不被这个说明禁用：同仓库可以并行派发 */
const dispatchBtn = $('[data-act="confirm-dispatch"]')
assert.ok(dispatchBtn, '确认并派发按钮应存在')
assert.equal(sameRepo.hasAttribute('data-blocking'), false, '说明不是阻断项')
console.log('OK: 同仓库仍可派发（按钮 disabled=' + dispatchBtn.disabled + '）')

/* 切到不同仓库时说明消失 */
type('#w3-local', 'C:\\test-projects\\unused-app')
await tick(30)
assert.equal($('[data-same-repo="1"]'), null, '换仓库后说明应消失')
console.log('OK: 换仓库后说明消失')

/* 6) 卡片显示工作区（先失焦：输入中页面不重建 DOM，真实点击也会先 blur） */
if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur()
click('[data-view="sessions"]')
await tick(60)
const cardTexts = $$('.w3-runCard').map((c) => c.textContent.replace(/\s+/g, ' '))
assert.ok(cardTexts.some((t) => t.includes('工作区')), '有 worktree 的卡片应显示工作区，实际：' + JSON.stringify(cardTexts))
console.log('OK: 卡片显示工作区')

/* 7) 已结束的 run 才能删；两步确认 */
if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur()
click('[data-view="sessions"]')
await tick(80)
const doneCard = $$('.w3-runCard').find((c) => c.getAttribute('data-run-id') === 'run-done')
assert.ok(doneCard, '应有已结束的卡片')
assert.ok(doneCard.textContent.includes('删除'), '已结束的卡片应有删除按钮')
const activeCard = $$('.w3-runCard').find((c) => c.getAttribute('data-run-id') === 'run-other')
assert.ok(!activeCard.textContent.includes('删除'), '进行中的卡片不应有删除按钮')
doneCard.querySelector('[data-act="ask-remove"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
await tick(60)
const confirmCard = $$('.w3-runCard').find((c) => c.getAttribute('data-run-id') === 'run-done')
assert.ok(confirmCard.textContent.includes('确认删除'), '第一次点击应进入确认态')
assert.ok(confirmCard.querySelector('[data-act="remove-run"]'), '确认态应出现确认删除按钮')
confirmCard.querySelector('[data-act="cancel-remove"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
await tick(60)
const resetCard = $$('.w3-runCard').find((c) => c.getAttribute('data-run-id') === 'run-done')
assert.ok(!resetCard.textContent.includes('确认删除'), '取消后回到普通删除按钮')
console.log('OK: 删除两步确认 + 只对已结束 run 开放')

console.log('\n全部通过')
win.close()
