/** 自由输入草稿自动落盘 + 刷新恢复的冒烟测试。 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

import { sshConfigJson } from './window3-test-fixture.mjs'

const require = createRequire(new URL('../../worktable/01_content/package.json', import.meta.url))
const { JSDOM } = require('jsdom')

const raw = readFileSync(new URL('../window3-dispatch.html', import.meta.url), 'utf8').replace(/<link[^>]*>/g, '')
const sshConfig = sshConfigJson
const desk = '生产环境容器偶发 500，日志有 OutOfMemoryError，影响通讯录导入。'

function makeDom(storageSeed) {
  const dom = new JSDOM(raw, {
    url: 'http://127.0.0.1:3080/api/worktable/site/x/window3-dispatch.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      if (storageSeed) for (const [k, v] of Object.entries(storageSeed)) win.localStorage.setItem(k, v)
      win.fetch = async (url) => {
        const u = String(url)
        if (u.includes('/api/bug-solver/runs')) return res({ runs: [] })
        if (u.includes('data/ssh-config.json')) return res(JSON.parse(sshConfig))
        return res({})
      }
    },
  })
  return dom
}
const res = (obj) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => obj, text: async () => JSON.stringify(obj) })
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

let dom = makeDom(null)
let win = dom.window
await tick(120)
win.document.querySelector('[data-act="new-manual"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
await tick(150)
const ta = win.document.querySelector('#w3-problem')
assert.ok(ta, '应出现问题描述框')
ta.value = desk
ta.dispatchEvent(new win.Event('input', { bubbles: true }))
await tick(750) // 等自动保存节流（600ms）

const map = JSON.parse(win.localStorage.getItem('bug-solver.dispatch.draft.v1'))
const ids = Object.keys(map.drafts || {})
assert.equal(ids.length, 1, '应自动保存一条草稿')
const saved = map.drafts[ids[0]]
assert.equal(saved.bug.source, 'manual')
assert.equal(saved.bug.description, desk)
assert.equal(saved.bug.id, ids[0])
console.log('OK: 打字后自动落盘（草稿 ' + ids[0] + '）')
const seed = { 'bug-solver.dispatch.draft.v1': win.localStorage.getItem('bug-solver.dispatch.draft.v1') }
win.close()

// 刷新（新 JSDOM，同一 localStorage）→ 草稿恢复
dom = makeDom(seed)
win = dom.window
await tick(150)
const restored = win.document.querySelector('#w3-problem')
assert.ok(restored, '刷新后应直接回到自由输入确认页')
assert.equal(restored.value, desk, '刷新后问题描述应原样恢复')
assert.ok(win.document.querySelector('[data-card="confirm"]'), '刷新后应停在确认页')
console.log('OK: 刷新后草稿恢复')
console.log('\n全部通过')
win.close()
