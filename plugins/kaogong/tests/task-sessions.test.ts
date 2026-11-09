import test from 'node:test'
import assert from 'node:assert/strict'
import {StudyRoles} from '../src/study-roles.ts'
import {StudyTaskSessions} from '../src/task-sessions.ts'
import {teachingSkillProvider} from '../src/role-definitions.ts'

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

function harness(options: {instances?: string[]} = {}) {
  const instances = options.instances ?? ['profile-a']
  const cwd = process.cwd()
  const bindings = memoryTable()
  const sessionIds: string[] = []
  const created: {sessionId: string; agentPreset: string}[] = []
  const views = Object.fromEntries(instances.map(instanceId => ['view:' + instanceId, instanceId]))
  const workspace = {
    async resolveView(viewId: string) {
      const instanceId = views[viewId]
      if (!instanceId) throw Error('学习视图未登记')
      return {
        profile: {id: instanceId, kind: 'learner', title: '备考', revision: 1},
        instance: {id: instanceId, appId: 'kaogong', projectId: null, revision: 1},
        view: {id: viewId, instanceId, type: 'page'},
      }
    },
    async assertProfile(instanceId: string) {
      if (!instances.includes(instanceId)) throw Error('需要明确的备考档案')
      return {id: instanceId, kind: 'learner', title: '备考', revision: 1}
    },
    async list() { return {profiles: instances.map(id => ({id, kind: 'learner', title: '备考', revision: 1})), views: []} },
    domain: {table: (name: string) => { assert.equal(name, 'bindings'); return bindings }},
  }
  const ctx = {
    on: () => () => {},
    skills: {
      async snapshot() { return {complete: true} },
      async get() { return {provider: teachingSkillProvider, invocation: {modelInvocable: true, userInvocable: true}} },
    },
    workspaceRegistry: {list: () => [{id: 'native-study-workspace', path: cwd, sessionIds}]},
    agentPresets: {
      async resolve() { return {broken: false} },
      async acquireScope() { return {key: 'standard', [Symbol.asyncDispose]: async () => {}} },
    },
    sessionPersistence: {
      async stat(sessionId: string) { return sessionIds.includes(sessionId) ? {header: {id: sessionId, cwd}, formatStatus: 'current'} : null },
      async flush() {},
    },
    sessionController: {
      async create(input: {sessionId: string; agentPreset: string}) {
        created.push(input); sessionIds.push(input.sessionId); return input
      },
      async projections() { return {kind: 'sequenced', values: {agentPreset: 'standard'}} },
    },
  }
  const roles = new StudyRoles(ctx as never, workspace as never, cwd)
  ;(roles as unknown as {owner: unknown}).owner = {prepare: async () => ({scope: {}, dispose() {}})}
  return {bindings, created, sessionIds, workspace, ctx, roles, views, instances}
}

const directory = (tasks: Record<string, {taskId: string; lessonId: string; subject: string; roleId: string}>) => ({
  async task(_instanceId: string, taskId: string) { return tasks[taskId] ?? null },
  async lesson(_instanceId: string, lessonId: string) {
    return Object.values(tasks).find(row => row.lessonId === lessonId) ?? null
  },
})

test('任务绑定把原生会话持久化到任务身份下，重复进入复用同一个会话', async () => {
  const {bindings, roles} = harness()
  const input = {instanceId: 'profile-a', roleId: 'teacher', taskId: 'task-a', lessonId: 'lesson-a', viewId: 'view:profile-a'}
  const first = await roles.ensureTask(input)
  const second = await roles.ensureTask(input)
  assert.equal(first.sessionId, second.sessionId, '同一任务重复进入必须复用原会话')
  assert.equal(bindings.size, 1, '只保留一条任务绑定')
  const row = bindings.all()[0]!
  assert.equal(row.kind, 'task')
  assert.equal(row.taskId, 'task-a')
  assert.equal(row.lessonId, 'lesson-a')
  assert.equal(row.phase, 'ready')
  await assert.rejects(() => roles.ensureTask({...input, lessonId: 'lesson-other'}), /课堂|任务/)
})

test('不同任务、不同档案各自创建独立任务会话，角色读取不会拿到任务会话', async () => {
  const {bindings, roles} = harness({instances: ['profile-a', 'profile-b']})
  const base = {roleId: 'teacher', kind: 'lesson'}
  const a1 = await roles.ensureTask({instanceId: 'profile-a', taskId: 'task-a', lessonId: 'lesson-a', viewId: 'view:profile-a', ...base})
  const a2 = await roles.ensureTask({instanceId: 'profile-a', taskId: 'task-b', lessonId: 'lesson-b', viewId: 'view:profile-a', ...base})
  const b1 = await roles.ensureTask({instanceId: 'profile-b', taskId: 'task-a', lessonId: 'lesson-a', viewId: 'view:profile-b', ...base})
  assert.equal(new Set([a1.sessionId, a2.sessionId, b1.sessionId]).size, 3)
  assert.equal(bindings.size, 3)
  const role = await roles.ensure('profile-a', 'teacher', 'view:profile-a')
  assert.equal((await roles.read('profile-a', 'teacher')).binding?.sessionId, role.sessionId, '角色读取只返回角色级绑定')
  assert.notEqual(role.sessionId, a1.sessionId)
  await assert.rejects(() => roles.openTask({instanceId: 'profile-a', roleId: 'teacher', taskId: 'task-a', lessonId: 'lesson-a', sessionId: a2.sessionId, revision: a2.revision}), /绑定|刷新/)
  await roles.openTask({instanceId: 'profile-a', roleId: 'teacher', taskId: 'task-a', lessonId: 'lesson-a', sessionId: a1.sessionId, revision: a1.revision})
})

test('课堂会话按任务解析；旧课堂没有任务身份时回落到既有角色会话', async () => {
  const {bindings, roles, workspace} = harness({instances: ['profile-a', 'profile-b']})
  const tasks = directory({
    'task-a': {taskId: 'task-a', lessonId: 'lesson-a', subject: '行测-资料分析', roleId: 'teacher'},
    'task-b': {taskId: 'task-b', lessonId: 'lesson-b', subject: '行测-资料分析', roleId: 'teacher'},
  })
  const sessions = new StudyTaskSessions(workspace as never, roles, tasks as never)
  const a = await sessions.ensure('view:profile-a', 'task-a')
  assert.equal(a.taskId, 'task-a')
  assert.equal(a.lessonId, 'lesson-a')
  assert.equal((await sessions.ensure('view:profile-a', 'task-a')).sessionId, a.sessionId)
  const b = await sessions.ensure('view:profile-a', 'task-b')
  assert.notEqual(b.sessionId, a.sessionId)
  const foreign = await sessions.ensure('view:profile-b', 'task-a')
  assert.equal(new Set([a.sessionId, b.sessionId, foreign.sessionId]).size, 3, '跨档案不复用任务会话')
  assert.equal((await sessions.forLesson('view:profile-a', 'lesson-a', 'teacher')).sessionId, a.sessionId)
  await assert.rejects(() => sessions.forLesson('view:profile-a', 'lesson-a', 'class-advisor'), /角色/)
  assert.equal(await sessions.forLesson('view:profile-a', 'legacy-lesson', 'teacher'), null, '没有任务身份的旧课堂回落到角色会话')
  assert.equal(bindings.size, 3)
})
