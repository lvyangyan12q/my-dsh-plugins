import test from 'node:test'
import assert from 'node:assert/strict'

type Registration = {options: Record<string, unknown>; component: unknown}

/** 最小化但遵守文档语义的 slots 台账：声明先于注册，declaration 生命周期结束后可重注册。 */
function slotLedger() {
  const registered: Registration[] = []
  const declared = new Set<string>(['main', 'sidebar.panellist', 'sidebar.right.pane.tab'])
  const waiting = new Map<string, (() => unknown)[]>()
  const register = (options: Record<string, unknown>, component: unknown) => {
    registered.push({options, component})
    for (const child of Object.keys((options.children ?? {}) as Record<string, unknown>)) {
      declared.add(child)
      for (const setup of waiting.get(child) ?? []) setup()
      waiting.delete(child)
    }
    return () => {}
  }
  const inject = (key: string, setup: () => unknown) => {
    if (declared.has(key)) setup()
    else waiting.set(key, [...(waiting.get(key) ?? []), setup])
    return () => {}
  }
  return {registered, register, inject}
}

function context() {
  const ledger = slotLedger()
  const sessions = {retain: () => { throw new Error('unused') }}
  const ctx = {
    sessions,
    slots: {inject: ledger.inject, register: ledger.register},
    effect(fn: () => unknown) { const value = fn() as Iterator<unknown> | undefined; if (value && typeof value[Symbol.iterator] === 'function') for (const _ of value) { /* 同步注册已发生 */ } return () => {} },
    sidebarRightTabs: {register: () => () => {}},
    sidebarRight: {mounted: {getSnapshot: () => undefined, subscribe: () => () => {}}},
    uiWorkspace: {openSession: () => {}},
    layout: {selectPanel: () => {}},
  }
  return {ctx, sessions, registered: ledger.registered}
}

test('插件把课堂答疑注册为公开插槽：主面板声明、根作用域保留会话、会话作用域内复用原生内容', async () => {
  const {apply, panelId} = await import('../src/client.tsx')
  const {ctx, sessions, registered} = context()
  apply(ctx as never)
  const at = (name: string) => registered.find(row => row.options.name === name)
  assert.deepEqual(at('main')?.options.key, panelId)
  assert.deepEqual(at('main')?.options.children, {'kaogong.teacher.session': {kind: 'single', scope: 'root'}}, '主面板只声明课堂答疑位置，不自己持有原生会话')
  assert.deepEqual(at('kaogong.teacher.session')?.options.children, {'kaogong.teacher.body': {kind: 'single', scope: 'session'}}, '会话作用域由插件自己的 slot 声明建立')
  assert.deepEqual((at('kaogong.teacher.session')?.options.inject as () => {sessions: unknown})(), {sessions}, '课堂通过注入的 ctx.sessions 保留指定会话')
  assert.ok(at('kaogong.teacher.body'), '会话作用域里的原生内容 slot 已注册')
  assert.equal(at('sidebar.right.pane.tab')?.options.children, undefined, '右栏学习面板不声明答疑会话，避免与原生输入框争用')
})
