import test from 'node:test'
import assert from 'node:assert/strict'
import {StudyTeaching} from '../src/study-teaching.ts'

/** Minimal durable-shaped table: the real one is a validated KvTable shared by the workspace domain. */
function memoryTable(initial: [string, Record<string, unknown>][] = []) {
  const rows = new Map<string, Record<string, unknown>>(initial)
  return {
    get: (key: string) => rows.get(key),
    entries: () => rows.entries(),
    keys: () => rows.keys(),
    get size() { return rows.size },
    async put(key: string, value: Record<string, unknown>) { rows.set(key, structuredClone(value)) },
    all: () => [...rows.values()],
  }
}

type View = {instanceId: string; viewId: string}

function harness(options: {views?: Record<string, string>; view?: View; owner?: unknown; prompt?: (request: any) => Promise<unknown>; taskSessions?: unknown} = {}) {
  const views = options.views ?? {[options.view?.viewId ?? 'view-a']: options.view?.instanceId ?? 'profile-a'}
  const viewId = options.view?.viewId ?? Object.keys(views)[0]!
  const table = memoryTable()
  const prompts: any[] = []
  const workspace = {
    async resolveView(id: string) {
      const instanceId = views[id]
      if (!instanceId) throw Error('学习视图未登记')
      return {
        profile: {id: instanceId, kind: 'learner', title: '备考', revision: 1},
        instance: {id: instanceId, appId: 'kaogong', revision: 1},
        view: {id, instanceId},
      }
    },
    domain: {table: (name: string) => { assert.equal(name, 'teaching'); return table }},
  }
  const roles = {
    async read(instanceId: string, roleId: string) {
      return {binding: {instanceId, roleId, phase: 'ready', sessionId: 'role-session', revision: 1}}
    },
    async open() {},
  }
  const sources = {
    async capture() { return [] },
    withGrantLease: async <T>(operation: () => Promise<T>) => operation(),
  }
  const ctx = {
    sessionController: {prompt: async (request: any) => { prompts.push(request); return options.prompt ? options.prompt(request) : {accepted: true} }},
    sessionPersistence: {flush: async () => {}},
  }
  let prepareCalls = 0
  const owner = options.owner ?? {
    version: '1',
    identify: (payload: any) => payload?.lessonId ?? payload?.roundId,
    async prepare(_context: unknown, payload: any) {
      prepareCalls++
      return {id: payload.lessonId ?? payload.roundId, text: '继续课堂', contexts: []}
    },
    async validate() {},
    async beforeSubmit() {},
    async accepted() {},
    async notAdmitted() {},
  }
  const teaching = new StudyTeaching(ctx as never, workspace as never, roles as never, sources as never, options.taskSessions as never)
  teaching.register('lesson', owner as never)
  return {viewId, views, table, prompts, teaching, owner, workspace, roles, prepareCalls: () => prepareCalls}
}

test('同一课堂重复准备只保留一份教学草稿，返回同一个业务记录', async () => {
  const {viewId, table, teaching} = harness()
  const first = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  const second = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  assert.equal(second.id, first.id, '重复进入同一任务必须复用原草稿')
  assert.equal(table.size, 1, '不能新增第二份教学草稿')
  assert.equal(first.status, 'prepared')
})

test('同一发送请求被重试时只准入一次，后续重试被拒绝而不是再发一条', async () => {
  const {viewId, prompts, teaching} = harness()
  const draft = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  const sent = await teaching.submit(viewId, draft.id, draft.revision)
  assert.equal(sent.status, 'accepted')
  assert.equal(prompts.length, 1)
  assert.equal(prompts[0].requestId, sent.requestId, '准入请求使用已持久化的 requestId')
  await assert.rejects(() => teaching.submit(viewId, draft.id, draft.revision), /不会重发|已发送/)
  assert.equal(prompts.length, 1, '重试不能产生第二条真实消息')
})

test('已准入的同一任务再次进入直接返回原操作，不再调用所有者准备', async () => {
  const {viewId, prompts, teaching, prepareCalls} = harness()
  const draft = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  const sent = await teaching.submit(viewId, draft.id, draft.revision)
  assert.equal(sent.status, 'accepted')
  const again = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  assert.equal(again.id, draft.id)
  assert.equal(again.status, 'accepted')
  assert.equal(prepareCalls(), 1, '已发送的操作按业务键直接查询，不再准备')
  assert.equal(prompts.length, 1, '再次进入不会重发')
})

test('准入结果未知时保持未确认，不谎称成功也不自动重发', async () => {
  const {viewId, prompts, teaching} = harness({prompt: async () => { throw Error('response lost after Native acceptance') }})
  const draft = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  const unknown = await teaching.submit(viewId, draft.id, draft.revision)
  assert.equal(unknown.status, 'unknown')
  assert.match(unknown.notice ?? '', /不会自动重发/)
  assert.equal((await teaching.list(viewId))[0]?.status, 'unknown', '列表必须如实显示未确认')
  await assert.rejects(() => teaching.submit(viewId, draft.id, unknown.revision), /不会重发/)
  await assert.rejects(() => teaching.recover(viewId, draft.id), /不能恢复/)
  assert.equal(prompts.length, 1, '未知结果不自动重发')
  assert.equal((await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})).id, draft.id, '再次进入同一任务仍返回未确认的原操作')
  assert.equal(prompts.length, 1)
})

test('跨档案、跨任务各自保留自己的教学草稿，不互相复用', async () => {
  const {views, table, teaching} = harness({views: {'view-a': 'profile-a', 'view-b': 'profile-b'}})
  const a1 = await teaching.prepareOwned('view-a', {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  const a2 = await teaching.prepareOwned('view-a', {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-2'}})
  const b1 = await teaching.prepareOwned('view-b', {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  assert.equal(new Set([a1.id, a2.id, b1.id]).size, 3, '档案和任务都是草稿身份的一部分')
  assert.equal(table.size, 3)
  assert.deepEqual((await teaching.list('view-a')).map(row => row.id).sort(), [a1.id, a2.id].sort())
  assert.deepEqual((await teaching.list('view-b')).map(row => row.id), [b1.id], '另一个档案看不到本档案草稿')
  assert.equal(Object.keys(views).length, 2)
})

test('学习者正常的新提问不被当成重复教学去重', async () => {
  const {table, teaching} = harness()
  const first = await teaching.prepare('view-a', {roleId: 'teacher', text: '请继续讲这个知识点'})
  const second = await teaching.prepare('view-a', {roleId: 'teacher', text: '请继续讲这个知识点'})
  assert.notEqual(second.id, first.id, '同样的主动提问也是新的用户动作')
  assert.equal(table.size, 2)
})

test('任务课堂的教学草稿绑定该任务自己的会话，发送也落到该会话', async () => {
  const openCalls: unknown[] = []
  const taskSessions = {
    async forLesson(viewId: string, lessonId: string, roleId: string) {
      return {taskId: 'task-1', lessonId, roleId, sessionId: 'task-session-1', revision: 4}
    },
    async open(instanceId: string, roleId: string, session: unknown) { openCalls.push([instanceId, roleId, session]) },
  }
  const {viewId, prompts, teaching} = harness({taskSessions})
  const draft = await teaching.prepareOwned(viewId, {roleId: 'teacher', kind: 'lesson', payload: {lessonId: 'lesson-1'}})
  assert.equal(draft.sessionId, 'task-session-1', '教学草稿使用任务会话而不是角色会话')
  assert.deepEqual(draft.taskSession, {taskId: 'task-1', lessonId: 'lesson-1', roleId: 'teacher', revision: 4})
  const sent = await teaching.submit(viewId, draft.id, draft.revision)
  assert.equal(sent.status, 'accepted')
  assert.equal(prompts[0].sessionId, 'task-session-1')
  assert.equal(openCalls.length, 1, '发送前按任务绑定复核会话')
})

test('历史prepared保留但重新准备必须生成当前授权的新草稿', async () => {
  const {teaching,table,viewId,prepareCalls}=harness()
  const old=await teaching.prepareOwned(viewId,{roleId:'teacher',kind:'lesson',payload:{lessonId:'lesson-1'}})
  await table.put(old.id,{...old,historicalHandoff:true})
  const fresh=await teaching.prepareOwned(viewId,{roleId:'teacher',kind:'lesson',payload:{lessonId:'lesson-1'}})
  assert.notEqual(fresh.id,old.id)
  assert.equal(fresh.status,'prepared')
  assert.equal(prepareCalls(),2)
  assert.equal(table.get(old.id)?.historicalHandoff,true)
  assert.equal((await teaching.submit(viewId,fresh.id,fresh.revision)).status,'accepted')
})

test('升级前的旧草稿没有任务字段时仍按角色会话发送，不被破坏', async () => {
  const {viewId, table, prompts, teaching} = harness({taskSessions: {
    async forLesson() { return {taskId: 'task-1', lessonId: 'lesson-old', roleId: 'teacher', sessionId: 'task-session-1', revision: 1} },
    async open() { throw Error('legacy draft must not use a task session') },
  }})
  await table.put('legacy-draft', {
    id: 'legacy-draft', revision: 1, status: 'prepared', appId: 'kaogong', instanceId: 'profile-a', instanceRevision: 1,
    roleId: 'teacher', sessionId: 'role-session', bindingRevision: 1, source: {viewId}, text: '旧草稿', contexts: [], createdAt: 1,
  })
  const sent = await teaching.submit(viewId, 'legacy-draft', 1)
  assert.equal(sent.status, 'accepted')
  assert.equal(prompts[0].sessionId, 'role-session', '没有任务字段的旧记录回落到原角色会话')
})

test('同课堂不同主动动作可以新发，同动作重试复用且unknown保持保护',async()=>{
 const {teaching,prompts,viewId}=harness()
 const prepare=(actionId:string)=>teaching.prepareOwned(viewId,{roleId:'teacher',kind:'lesson',payload:{lessonId:'lesson-1'},actionId})
 const first=await prepare('click-1');await teaching.submit(viewId,first.id,first.revision)
 assert.equal((await prepare('click-1')).id,first.id)
 const next=await prepare('click-2');assert.notEqual(next.id,first.id);await teaching.submit(viewId,next.id,next.revision)
 assert.equal(prompts.length,2)
})
