import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { ManagementCatalogView } from '../src/management-view.tsx'

test('independent libraries save invocation policy without managing application role bindings', async () => {
  const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost' })
  const original = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const oldFetch = globalThis.fetch
  const calls = []
  let agent = { id: 'writer', name: '写作助手', description: '多个应用复用', persona: 'Assist', skillNames: ['outline','legacy-native'], modelInvocable: true, userInvocable: true, revision: 2, managed: true, appIds: ['example'] }
  const key = { appId: 'example', instanceId: 'default', roleId: 'advisor' }
  const catalog = () => ({ version: 1, agents: [agent], roles: [{ key, name: '班主任', presetId: 'writer', binding: { sessionId: 'existing-session' }, assignment: { names: ['outline'] } }], presets: [], skills: [{ name: 'outline', description: '整理提纲', source: 'managed', provider: 'test', userInvocable: true, modelInvocable: true, managed: true, revision: 1, appIds: ['example'] },{name:'native-new',description:'New private Skill',source:'bundled',provider:'test',appIds:[],managed:false,userInvocable:true,modelInvocable:true},{name:'legacy-native',description:'Existing native reference',source:'bundled',provider:'test',appIds:[],managed:false,userInvocable:true,modelInvocable:true},{name:'managed-disabled',description:'Disabled managed Skill',source:'runtime',provider:'test',appIds:[],managed:true,userInvocable:false,modelInvocable:false}], executions: [{ id: 'run-1', kind: 'agent', capabilityId: 'writer', sessionId: 's', startedAt: '2026-10-02', status: 'completed' }] })
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request)
    if (request.action === 'catalog') return { ok: true, json: async () => catalog() }
    if (request.action === 'agent-save') { assert.equal(request.expectedRevision, 2); agent = { ...agent, ...request.agent, revision: 3 }; return { ok: true, json: async () => ({ agent }) } }
    if (request.action === 'agent-bind') return { ok: true, json: async () => ({ sessionId: 'new-session' }) }
    if (request.action === 'skill-save') { assert.equal(request.expectedRevision, 1); assert.equal(request.skill.content, 'Actual saved instructions'); return { ok: true, json: async () => ({ skill: { ...request.skill, revision: 2 } }) } }
    if (request.action === 'skill-read') return { ok: true, json: async () => ({ content: 'Actual saved instructions' }) }
    assert.fail(`Unexpected request ${request.action}`)
  }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('mount'))
  const render = tab => root.render(React.createElement(ManagementCatalogView, { tab, active: true, apps: [{ id: 'example', name: '考公学习' }], query: '', commands: {}, t: key => key }))
  const click = async text => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === text); assert.ok(button, text); await act(async () => button.click()) }
  try {
    await act(async () => render('agents'))
    assert.equal(document.querySelectorAll('.pim-card').length, 1)
    assert.equal(document.querySelectorAll('.pwb-role-row').length, 0, 'app roles are usage rather than independent Agent identities')
    await act(async () => document.querySelector('.pim-card').click())
    assert.match(document.body.textContent, /考公学习 · 班主任/)
    assert.match(document.body.textContent, /completed/)
    const skillChoices=[...document.querySelectorAll('.pim-check')].map(row=>row.textContent);
    assert.ok(skillChoices.includes('outline'));assert.ok(skillChoices.includes('legacy-native'));
    assert.ok(!skillChoices.includes('native-new'),'new native Skill references must not be offered');
    assert.ok(!skillChoices.includes('managed-disabled'),'disabled managed Skills must not be offered');
    const modelToggle = [...document.querySelectorAll('label')].find(label => label.textContent.includes('允许模型调用')).querySelector('input')
    await act(async () => modelToggle.click()); await click('保存')
    assert.equal(agent.modelInvocable, false)
    assert.equal(document.querySelector('select[aria-label="绑定应用角色"]'), null)
    assert.equal(calls.some(row => row.action === 'agent-bind'), false)
    await act(async () => render('skills'))
    await act(async () => document.querySelector('.pim-card').click())
    assert.equal(document.querySelector('textarea[aria-label="Skill 内容"]').value, 'Actual saved instructions')
    assert.match(document.body.textContent, /Agent · 写作助手/)
    const manualToggle = [...document.querySelectorAll('label')].find(label => label.textContent.includes('允许手动调用')).querySelector('input')
    await act(async () => manualToggle.click()); await click('保存')
    assert.equal(calls.find(row => row.action === 'skill-save').skill.userInvocable, false)
    assert.equal(calls.some(row => row.action === 'agent-open'), false, 'catalog navigation must never create a chat')
  } finally {
    await act(async () => root.unmount()); dom.window.close(); globalThis.fetch = oldFetch
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
})

