import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const React = require('react')

test('built generic role view reads per-ID official status facts without a fake conversation or implicit command', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const previous = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const entries = [], cleanup = []
  let exports
  const fail = () => assert.fail('No native command authorized by status rendering')
  const ctx = { inject: (services, callback) => { if (services.includes('uiConversation')) callback(ctx) }, effect: action => { const result = action(); if (typeof result === 'function') cleanup.push(result); return result },
    reflect: { provide: () => () => {} }, locale: { register: () => () => {} }, sessions: { retain: fail, using: fail }, workspaces: { list: {} },
    slots: { inject: (_name, callback) => callback(), register: (options, component) => { entries.push({ options, component }); return () => {} }, registerFactory: (options, component) => { entries.push({ options, component }); return () => {} } },
  }
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { console, AbortController, fetch: fail,
    window: Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }) => { exports = factory(require) } } }) })
  exports.apply(ctx)
  const entry = entries.find(row => row.options.name === 'personal-workbench.role-conversation')
  assert.ok(entries.find(row=>row.options.name==='personal-workbench.role-history'),'Retained Session history needs a scoped native view inside the application')
  assert.ok(entry.options.inject().hooks.roles, 'Observables travel through the documented inject hooks compartment')
  const bindingKey = { appId: 'application', instanceId: 'default', roleId: 'teacher', subject: 'math' }
  const state = { binding: { version: 1, key: bindingKey, sessionId: 'math-id', presetId: 'math', phase: 'ready', previousSessionIds: [] }, busy: false, error: null, window: { phase: 'closed' } }
  const statuses = new Map([['other-id', { running: true, pendingInteraction: { kind: 'approval' }, completionUnread: true }]])
  const props = { ...entry.options.inject(), bindingKey, t: key => key, label: 'Math teacher', active: false, useRoles: selector => selector(new Map([[JSON.stringify(['application', 'default', 'teacher', 'math']), state]])), useSessionStatus: selector => selector(statuses), renderSlot: fail }
  const { createRoot } = require('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  try {
    await React.act(async () => root.render(React.createElement(entry.component, props)))
    assert.doesNotMatch(dom.window.document.body.textContent, /运行中|待处理|未读完成/)
    statuses.set('math-id', { running: true, pendingInteraction: { kind: 'approval' }, completionUnread: true })
    await React.act(async () => root.render(React.createElement(entry.component, { ...props })))
    assert.match(dom.window.document.body.textContent, /运行中/)
    assert.match(dom.window.document.body.textContent, /待处理：approval/)
    assert.match(dom.window.document.body.textContent, /未读完成/)
    assert.match(dom.window.document.body.textContent, /Math teacher/)
    const openedHistory=[]
    state.binding.previousSessionIds=['prior-agent-session']
    await React.act(async()=>root.render(React.createElement(entry.component,{...props,openHistory:id=>openedHistory.push(id)})))
    const historyButton=dom.window.document.querySelector('button[aria-label="roleOpenHistory: prior-agent-session"]')
    assert.ok(historyButton,'Retained prior Session IDs need a visible native-history entrance')
    await React.act(async()=>historyButton.click())
    assert.deepEqual(openedHistory,['prior-agent-session'])
    assert.equal(state.binding.sessionId,'math-id','Viewing history cannot replace the active role binding')
    const historyCalls=[]
    await React.act(async()=>root.render(React.createElement(entry.component,{...props,renderFactorySlot:(name,props)=>{historyCalls.push({name,props});return React.createElement('div',null,'Native history viewer') }})))
    await React.act(async()=>dom.window.document.querySelector('button[aria-label="roleViewHistory: prior-agent-session"]').click())
    assert.equal(historyCalls.at(-1).name,'personal-workbench.role-history')
    assert.equal(historyCalls.at(-1).props.sessionId,'prior-agent-session')
    assert.equal(state.binding.sessionId,'math-id')
    await React.act(async()=>historyCalls.at(-1).props.close())
    state.window={phase:'open',reference:{sessionId:'math-id'}}
    await React.act(async()=>root.render(React.createElement(entry.component,{...props,expectedPresetId:'new-agent',SessionProvider:()=>assert.fail('A mismatched Agent must not expose the old native composer')})))
    assert.match(dom.window.document.body.textContent,/rolePresetChanged/,'Activating a different Agent must visibly explain why the old role Session is not usable')
    assert.equal(state.binding.sessionId,'math-id','A changed recipe must preserve the old Session until explicit replacement')
    assert.ok([...dom.window.document.querySelectorAll('button')].some(button=>button.textContent.includes('新建角色会话')),'Explicit recovery must remain available')
    const reopened=[]
    state.error='Application disabled'
    const recoveredProps={...props,expectedPresetId:'new-agent',commands:{open:async key=>reopened.push(key)},SessionProvider:fail}
    await React.act(async()=>root.render(React.createElement(entry.component,{...recoveredProps,active:false})))
    assert.equal(reopened.length,0,'Hidden application must not reopen its role')
    await React.act(async()=>root.render(React.createElement(entry.component,{...recoveredProps,active:true})))
    assert.deepEqual(reopened,[bindingKey],'Explicitly reopening an enabled application must re-read its retained role despite cached disabled errors')
    state.error=null
    state.window={phase:'closed'};
    for(const message of ['Packaged role Skill not discovered','Packaged role Skill body unavailable for user invocation']){
      state.error=message;await React.act(async()=>root.render(React.createElement(entry.component,{...props,active:false})));
      assert.equal(dom.window.document.querySelector('[role="alert"]').textContent,'roleTeachingSkillUnavailable','missing packaged teaching Skill needs actionable localized guidance');
      assert.ok([...dom.window.document.querySelectorAll('button')].some(button=>button.textContent.includes('重试')));
    }
    state.error='Unrelated preserved recovery error';await React.act(async()=>root.render(React.createElement(entry.component,{...props,active:false})));
    assert.equal(dom.window.document.querySelector('[role="alert"]').textContent,state.error,'other native recovery errors retain their own diagnostic');
    state.error=null;
    const history=entries.find(row=>row.options.name==='personal-workbench.role-history'),retained=[],released=[]
    ctx.workspaces.list={getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}
    ctx.sessions.retain=id=>{retained.push(id);const binding={session:{getSnapshot:()=>({openState:'open',removed:false}),subscribe:()=>()=>{}}};return {sessionId:id,binding,ready:Promise.resolve(binding),release:()=>released.push(id)}}
    let requestedHistory='prior-agent-session'
    const historyRenders=[]
    const historyProps={...history.options.inject(),close:fail,t:k=>k,SessionProvider:({session,children})=>{historyRenders.push({requested:requestedHistory,rendered:session.sessionId});return React.createElement('div',{'data-native-id':session.sessionId},children)},renderSlot:name=>React.createElement('div',null,name)}
    await React.act(async()=>{root.render(React.createElement(history.component,{...historyProps,sessionId:requestedHistory}));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.deepEqual(retained,['prior-agent-session'],'Viewing history must retain the exact old native Session')
    assert.equal(dom.window.document.querySelector('[data-native-id]').getAttribute('data-native-id'),'prior-agent-session')
    assert.match(dom.window.document.body.textContent,/personal-workbench.history-native/)
    assert.equal(state.binding.sessionId,'math-id')
    requestedHistory='second-prior-session'
    await React.act(async()=>{root.render(React.createElement(history.component,{...historyProps,sessionId:requestedHistory}));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.ok(historyRenders.some(row=>row.requested==='second-prior-session'&&row.rendered==='second-prior-session'))
    assert.ok(historyRenders.every(row=>row.requested===row.rendered),'A new history identity must never render the previous native conversation, even before passive effects run')
    assert.deepEqual(retained,['prior-agent-session','second-prior-session'])
    await React.act(async()=>root.render(React.createElement('div')))
    assert.deepEqual(released,['prior-agent-session','second-prior-session'],'Switching and leaving history release each separate native reference')
    const native = entries.find(row => row.options.name === 'personal-workbench.role-native')
    const factories = []
    await React.act(async () => root.render(React.createElement(native.component, {
      useSession: selector => selector({}),
      renderFactorySlot: (name, owner) => { factories.push({ name, owner }); return React.createElement('div', null, name) },
    })))
    assert.deepEqual(factories.map(row => row.name), ['conversation.content', 'conversation.session.chrome'])
    assert.equal(factories[1].owner.hideChrome, false)
    const attachment = entries.find(row => row.options.name === 'personal-workbench.role-attachment')
    const candidates = ['session-one', 'session-two'].map(id => ({ id, displayTitle: 'Same title', cwd: '/same/workspace', origin: 'user' }))
    await React.act(async () => root.render(React.createElement(attachment.component, {
      bindingKey, expectedSessionId: 'math-id', commands: { attach: fail }, close: fail, t: key => key,
      useSessions: selector => selector({ phase: 'ready', ids: candidates.map(row => row.id), byId: Object.fromEntries(candidates.map(row => [row.id, row])) }),
      useWorkspaces: selector => selector({ phase: 'ready', archivedSessionIds: [] }),
    })))
    const choices = [...dom.window.document.querySelectorAll('option')].filter(option => option.value)
    assert.equal(choices.length, 2)
    assert.equal(new Set(choices.map(option => option.textContent)).size, 2, 'Native Sessions with identical title/cwd must remain distinguishable')
    for (const [index, choice] of choices.entries()) {
      assert.equal(choice.value, candidates[index].id, 'Readable labels cannot alter native binding identity')
      assert.ok(choice.textContent.includes(candidates[index].id))
    }

  } finally {
    await React.act(async () => root.unmount())
    for (const dispose of cleanup.reverse()) await dispose()
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
})

