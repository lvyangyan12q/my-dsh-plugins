import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import type {ComponentType, ReactNode} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, root: createRoot(window.document.getElementById('root')!), restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

type RetainCall = {kind: 'retain' | 'release'; id: string; options?: {source: string; signal?: AbortSignal}}

function fakeSessions() {
  const calls: RetainCall[] = []
  const sessions = {
    retain(id: string, options: {source: string; signal?: AbortSignal}) {
      calls.push({kind: 'retain', id, options})
      return {sessionId: id, ready: Promise.resolve(), release() { calls.push({kind: 'release', id}) }}
    },
  }
  return {calls, sessions}
}

test('课堂内嵌会话保留指定 sessionId，并在公开会话作用域内渲染课堂自己的插槽', async () => {
  const {dom, root, restore} = environment()
  const {calls, sessions} = fakeSessions()
  const provided: {sessionId: string}[] = []
  const slots: string[] = []
  const SessionProvider = ({session, children}: {session?: {sessionId: string}; children?: ReactNode}) => {
    provided.push(session as {sessionId: string})
    return <div data-provider={session?.sessionId}>{children}</div>
  }
  const renderSlot = (key: string, owner: Record<string, unknown>) => {
    slots.push(key + ':' + JSON.stringify(owner))
    return <i data-body="embedded" />
  }
  try {
    const {TeacherSessionHost} = await import('../src/embedded-session.tsx')
    await act(async () => root.render(
      <TeacherSessionHost sessionId="teacher-session-1" sessions={sessions} SessionProvider={SessionProvider} renderSlot={renderSlot} /> as never,
    ))
    assert.deepEqual(
      calls.filter(call => call.kind === 'retain').map(call => ({id: call.id, source: call.options?.source})),
      [{id: 'teacher-session-1', source: 'kaogongClassroom'}],
      '只保留老师角色绑定的那一个原生会话',
    )
    assert.equal(provided.length, 1)
    assert.equal(provided[0]?.sessionId, 'teacher-session-1', '会话作用域就是指定的原生 sessionId')
    assert.equal(dom.window.document.querySelector('[data-provider]')?.getAttribute('data-provider'), 'teacher-session-1')
    assert.deepEqual(slots, ['kaogong.teacher.body:{}'], '课堂插槽渲染在会话作用域之内')
    assert.ok(dom.window.document.querySelector('[data-provider] [data-body="embedded"]'), '内容必须是作用域的子节点')

    await act(async () => root.unmount())
    assert.deepEqual(calls.map(call => call.kind), ['retain', 'release'])
    assert.equal(calls[1]?.id, 'teacher-session-1')
  } finally {
    restore()
    dom.window.close()
  }
})

test('会话保留失败时如实报错，不渲染任何模拟对话', async () => {
  const {dom, root, restore} = environment()
  const sessions = {retain() { throw new Error('Session Controller is disposed') }}
  let providerRendered = 0
  const SessionProvider = ({children}: {children?: ReactNode}) => { providerRendered++; return <>{children}</> }
  const renderSlot = () => <i data-body="embedded" />
  try {
    const {TeacherSessionHost} = await import('../src/embedded-session.tsx')
    await act(async () => root.render(
      <TeacherSessionHost sessionId="teacher-session-1" sessions={sessions} SessionProvider={SessionProvider} renderSlot={renderSlot} /> as never,
    ))
    assert.match(dom.window.document.body.textContent ?? '', /Session Controller is disposed/)
    assert.equal(providerRendered, 0)
    assert.equal(dom.window.document.querySelector('[data-body]'), null)
    assert.equal(dom.window.document.querySelector('[contenteditable="true"]'), null, '不能自造输入框')
  } finally {
    await act(async () => root.unmount())
    restore()
    dom.window.close()
  }
})

test('课堂会话体经公开 Conversation Factory 渲染嵌入式内容，并把视图固定到 chat', async () => {
  const {dom, root, restore} = environment()
  const factories: {name: string; props: unknown}[] = []
  const dispatched: [string, unknown][] = []
  const renderFactorySlot = (name: string, props: unknown, options: {slots: {views: ComponentType<{renderSlot: (key: string, owner: unknown) => ReactNode}>}}) => {
    factories.push({name, props})
    const Views = options.slots.views
    return <Views renderSlot={(key, owner) => { dispatched.push([key, owner]); return <b data-conversation="native" /> }} />
  }
  try {
    const {TeacherSessionBody} = await import('../src/embedded-session.tsx')
    await act(async () => root.render(<TeacherSessionBody renderFactorySlot={renderFactorySlot} /> as never))
    assert.deepEqual(factories, [{name: 'conversation.content', props: {variant: 'embedded', phase: 'active', hero: false}}])
    assert.deepEqual(dispatched, [['conversation.session', {view: 'chat'}]], '复用原生 chat 视图与输入框')
    assert.ok(dom.window.document.querySelector('[data-conversation="native"]'))
  } finally {
    await act(async () => root.unmount())
    restore()
    dom.window.close()
  }
})
