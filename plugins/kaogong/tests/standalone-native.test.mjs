import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readdir, lstat, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { mountKaogong } from '../src/production-host.ts'
import { inject as productionInject } from '../src/index.ts'

const native = process.env.DSH_SOURCE ?? 'D:/programming/workspace/deepseek-harness'
const load = file => import(pathToFileURL(resolve(native, file.replace('/lib/', '/src/').replace(/\.js$/, '.ts'))).href)

test('independent role HTTP creates a standard Native Session with private teaching Skill and isolates ordinary Sessions', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-native-independent-'))
  const { Context } = await load('vendor/cordis/lib/index.js'), ctx = new Context(), handles = new Map(), routes = new Map()
  const admitted = []
  let loseAdmissionResponse = false
  const workspace = { id: 'native-study-workspace', path: root, sessionIds: [] }
  let stop, backend
  const post = async body => {
    const req = Readable.from([JSON.stringify(body)]), res = { status: 0, writeHead(value) { this.status = value }, end(value) { this.value = JSON.parse(value) } }
    Object.assign(req, { method: 'POST', url: '/api/kaogong/study', headers: { 'content-type': 'application/json' } })
    await routes.get('exact:/api/kaogong/study').handler(req, res)
    return res
  }
  try {
    ctx.baseUrl = new URL('../package.json', import.meta.url).href
    ctx.provide('workingDirectory', { ensure: async () => root })
    await ctx.plugin((await load('vendor/loader/lib/index.js')).default)
    ctx.loader.builtins.group = (await load('vendor/group/lib/index.js')).default
    for (const file of ['packages/llm/llm/lib/index.js', 'packages/core/session/lib/index.js', 'packages/session/session-projection/lib/index.js', 'packages/core/system-prompt/lib/index.js', 'packages/core/tools/lib/index.js']) await ctx.plugin((await load(file)).default)
    await ctx.plugin(await load('packages/core/tool-executor-native/lib/index.js'))
    for (const file of ['packages/interaction/user-questions/lib/index.js', 'packages/core/agent/lib/index.js']) await ctx.plugin((await load(file)).default)
    await ctx.plugin((await load('packages/core/agent-loop/lib/index.js')).default, { agents: [] })
    await ctx.plugin((await load('packages/skill/skill/lib/index.js')).SkillRegistry)
    await ctx.plugin((await load('packages/preset/agent-preset-registry/lib/index.js')).default, { default: 'standard' })
    await ctx.agentPresets.register({ id: 'standard', name: 'Native standard', plugins: [] })
    await ctx.plugin(await load('packages/session/session-persistence-jsonl/lib/index.js'), { root: join(root, 'sessions'), compression: 'none' })
    ctx.provide('workspaceRegistry', { list: () => [workspace] })
    ctx.provide('sessionController', {
      prompt: async request => { admitted.push(request); if (loseAdmissionResponse) throw Error('response lost after Native acceptance'); return { accepted: true } },
      create: async ({ sessionId, agentPreset }) => {
        const handle = await ctx.agents.create({ sessionId, meta: { cwd: root, agentPreset }, setup: async child => { await ctx.agentPresets.mount(child, agentPreset) } })
        handles.set(sessionId, handle); workspace.sessionIds.push(sessionId)
        return { sessionId, agentPreset }
      },
      projections: async ({ sessionId }) => {
        const agent = handles.get(sessionId)?.agent
        if (agent) return { kind: 'sequenced', values: { agentPreset: ctx.agentPresets.presetForSession(agent.session) } }
        using observed = await ctx.sessionQuery.observeSession(sessionId)
        return { kind: 'sequenced', values: observed.projections.values }
      },
    })
    const { PluginPackages, createRuntimeResolution, initProfile, loadProfileDirectory } = await load('packages/boot/app-boot/lib/index.js')
    const profileDir = join(root, 'profiles/web'), anchor = join(native, 'apps/cli/package.json')
    await mkdir(join(root, 'profiles'), { recursive: true }); initProfile(profileDir, [])
    await ctx.plugin(PluginPackages, { resolution: await createRuntimeResolution({ installAnchor: anchor, home: root, profile: loadProfileDirectory('dsh', profileDir, anchor) }) })
    await ctx.plugin((await load('packages/storage/storage/lib/index.js')).default)
    const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js'), { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')
    backend = new JsonStorageBackend(join(root, 'storages')); ctx.storage.backend.register('json', backend)
    ctx.provide('storageDomain', new DomainFacility(ctx, { backend: 'json' }))
    ctx.provide('webServer', { register: row => { routes.set(row.kind + ':' + row.path, row); return () => routes.delete(row.kind + ':' + row.path) } })
    ctx.provide('connection', { admit: () => ({ peer: {} }) })
    ctx.provide('profileContext',{home:root,dir:profileDir})
    await new Promise((resolve, reject) => ctx.inject(productionInject, scope => {
      mountKaogong(scope, { roleCwd: root, currentSourceProfile:join(root,'profiles/old'), questionImageRoot: { get: () => undefined }, mineru: { get: () => undefined } }).then(dispose => { stop=dispose; resolve() }, reject)
    }))
    const created = await post({ action: 'create', title: '角色验证', kind: 'learner', confirmed: true })
    const viewId = created.value.view.id
    const ensured = await post({ action: 'role-ensure', viewId, roleId: 'class-advisor' })
    assert.equal(ensured.status, 200, JSON.stringify(ensured.value))
    assert.equal(ensured.value.presetId, 'standard')
    assert.equal(ensured.value.phase, 'ready')
    const agent = handles.get(ensured.value.sessionId).agent
    assert.equal((await ctx.skills.get('kaogong-teach', { scope: agent, cwd: root })).provider, 'kaogong-packaged-teaching')
    assert.equal(await ctx.skills.get('kaogong-teach'), undefined)
    const ordinaryId = crypto.randomUUID()
    await ctx.sessionController.create({ sessionId: ordinaryId, agentPreset: 'standard', workspaceId: workspace.id })
    assert.equal(await ctx.skills.get('kaogong-teach', { scope: handles.get(ordinaryId).agent, cwd: root }), undefined)
    assert.equal((await post({ action: 'session-context', sessionId: ordinaryId })).status, 409)
    const progressTool = ctx.tools.get('kaogong_progress_status', agent)
    const progress = await progressTool.execute({}, {agent})
    assert.equal(progress.submittedCount,0)
    assert.equal(progress.answeredCount,0)
    assert.equal(progress.unansweredCount,0)
    assert.deepEqual(progress.errorReasons,[])
    await assert.rejects(progressTool.execute({}, {agent:handles.get(ordinaryId).agent}))
    // Model-supplied confirmation never grants learner-page authority.
    const modelWrites = ['kaogong_record_question', 'kaogong_delete_question', 'kaogong_bank_add', 'kaogong_bank_delete', 'kaogong_bank_review', 'kaogong_practice', 'kaogong_practice_submit', 'kaogong_pdf_parse', 'kaogong_pdf_collect', 'kaogong_knowledge_add', 'kaogong_knowledge_delete']
    const admittedTools = await ctx.tools.resolve({agent, signal:new AbortController().signal})
    try {
      for (const name of modelWrites) {
        assert.equal(ctx.tools.get(name, agent, admittedTools), undefined, name + ' must be unavailable to the model')
        await assert.rejects(ctx.tools.get(name, agent).execute({confirmed:true, id:'model-chosen'}, {agent}), /LEARNER_PAGE_REQUIRED/, name)
      }
      assert.ok(ctx.tools.get('kaogong_progress_status', agent, admittedTools))
      assert.ok(ctx.tools.get('kaogong_lesson_read', agent, admittedTools))
    } finally { admittedTools.dispose() }
    const again = await post({ action: 'role-ensure', viewId, roleId: 'class-advisor' })
    const restored = await post({ action: 'session-context', sessionId: ensured.value.sessionId })
    assert.equal(restored.status, 200)
    assert.equal(restored.value.view.id, viewId)
    assert.equal(restored.value.profile.id, created.value.profile.id)
    assert.equal((await post({ action: 'session-context', sessionId: 'ordinary-native-session' })).status, 409)
    const foreign = await post({ action: 'create', title: '另一个档案', kind: 'learner', confirmed: true })
    assert.equal((await post({ action: 'session-context', viewId: foreign.value.view.id, sessionId: ensured.value.sessionId })).status, 409)
    assert.equal((await post({ action: 'session-context', viewId: null, sessionId: ensured.value.sessionId })).status, 409)
    assert.equal(again.value.sessionId, ensured.value.sessionId)
    assert.deepEqual((await ctx.agentPresets.list()).map(row => row.id), ['standard'])
    const prepared = await post({ action: 'task-prepare', viewId, roleId: 'class-advisor', text: '请协助我检查学习目标，先不要修改计划。', contexts: [] })
    assert.equal(prepared.status, 200, JSON.stringify(prepared.value))
    assert.equal(prepared.value.status, 'prepared')
    assert.equal(admitted.length, 0)
    const sent = await post({ action: 'task-submit', viewId, id: prepared.value.id, revision: prepared.value.revision })
    assert.equal(sent.status, 200, JSON.stringify(sent.value))
    assert.equal(sent.value.status, 'accepted')
    assert.equal(admitted[0].sessionId, ensured.value.sessionId)
    assert.equal(admitted[0].requestId, sent.value.requestId)
    assert.equal((await post({ action: 'task-submit', viewId, id: prepared.value.id, revision: prepared.value.revision })).status, 409)
    assert.equal(admitted.length, 1)
    loseAdmissionResponse = true
    const uncertain = await post({ action: 'task-prepare', viewId, roleId: 'class-advisor', text: '第二次学习建议，等待页面确认。', contexts: [] })
    const unknown = await post({ action: 'task-submit', viewId, id: uncertain.value.id, revision: uncertain.value.revision })
    assert.equal(unknown.value.status, 'unknown')
    assert.equal((await post({ action: 'task-list', viewId })).value.find(row => row.id === uncertain.value.id).status, 'unknown')
    assert.equal((await post({ action: 'task-submit', viewId, id: uncertain.value.id, revision: unknown.value.revision })).status, 409)
    assert.equal((await post({ action: 'task-recover', viewId, id: uncertain.value.id })).status, 409)
    assert.equal(admitted.length, 2)
    // Native can have opened a retained blank Session before the study panel.
    // Explicit handoff must mount its exact existing Agent, never replace/send it.
    const sourceDirectory=join(root,'profiles/old/worktable-platform');await mkdir(sourceDirectory,{recursive:true})
    const source={applications:{schema:1,applications:[],instances:[{id:'retained-study',appId:'kaogong',title:'保留档案',revision:1,projectId:null,createdAt:1,lastOpenedAt:1}],views:[{id:'retained-view',instanceId:'retained-study',type:'page'}]},resources:{schema:1,connections:[]},roles:{schema:1,bindings:[{key:JSON.stringify(['retained-study','teacher']),appId:'kaogong',instanceId:'retained-study',roleId:'teacher',sessionId:ordinaryId,presetId:'standard',phase:'ready',revision:2,creation:{cwd:root},previousSessionIds:[],agent:{kind:'agent',source:'application',ownerAppId:'kaogong',id:'teacher'}}],capabilities:[]},tasks:{schema:4,bindings:[],capabilities:[],tasks:[]},migrations:{schema:1,baselines:[],plans:[]}}
    for(const[name,data]of Object.entries(source))await writeFile(join(sourceDirectory,name+'.v1.json'),JSON.stringify(data))
    const preview=await post({action:'current-preview'});assert.equal(preview.status,200,JSON.stringify(preview.value))
    const handoff=await post({action:'current-confirm',id:preview.value.id,digest:preview.value.digest,confirmed:true});assert.equal(handoff.status,200,JSON.stringify(handoff.value))
    assert.equal((await ctx.skills.get('kaogong-teach',{scope:handles.get(ordinaryId).agent,cwd:root}))?.provider,'kaogong-packaged-teaching')
    assert.equal(admitted.length,2)
  } finally {
    await stop?.()
    for (const handle of handles.values()) await handle.dispose()
    await backend?.close(); await ctx.fiber.dispose()
    const actual = await realpath(root), base = await realpath(tmpdir()), offset = relative(base, actual)
    assert.ok(offset.startsWith('kaogong-native-independent-') && !isAbsolute(offset) && !offset.startsWith('..'))
    const scan = async file => { const stat = await lstat(file); assert.equal(stat.isSymbolicLink(), false); if (stat.isDirectory()) for (const name of await readdir(file)) await scan(join(file, name)) }
    await scan(actual); await rm(actual, { recursive: true })
  }
})
