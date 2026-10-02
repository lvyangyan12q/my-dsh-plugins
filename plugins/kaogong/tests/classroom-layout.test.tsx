import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { KaogongClassroom } from '../src/classroom.tsx'
import { KaogongStateContext, KaogongViewState } from '../src/view-state.tsx'

test('fixed learning split retains role draft across pages and remembers keyboard resize', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(names).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(names)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const owner = new KaogongViewState(); owner.cell('roles', null).set({ teach: async () => {} } as any)
  let mounts = 0
  function Chat() { useEffect(() => { mounts++ }, []); return <input aria-label="角色草稿" defaultValue="" /> }
  const factory = () => <Chat />
  const root = createRoot(dom.window.document.getElementById('root')!)
  const render = (pageId: string) => <KaogongStateContext.Provider value={owner}><KaogongClassroom embedded active={false} pageId={pageId} renderFactorySlot={factory as any} /></KaogongStateContext.Provider>
  try {
    await act(async () => root.render(render('classroom')))
    const input = document.querySelector('input[aria-label="角色草稿"]') as HTMLInputElement
    input.value = '未发送的老师问题'
    await act(async () => root.render(render('practice')))
    assert.equal(document.querySelector('input[aria-label="角色草稿"]'), input)
    assert.equal(input.value, '未发送的老师问题'); assert.equal(mounts, 1)
    assert.equal(document.querySelector('aside')!.hidden, false)
    assert.doesNotMatch(document.body.textContent!, /考公学习看板/)
    const divider = document.querySelector('[role="separator"]')!
    await act(async () => divider.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    assert.equal(divider.getAttribute('aria-valuenow'), '58')
    assert.equal(localStorage.getItem('kaogong.split.left'), '58')
    await act(async () => root.render(<div />))
    await act(async () => root.render(render('materials')))
    assert.equal(document.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'), '58')
  } finally {
    await act(async () => root.unmount()); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key] }
  }
})

