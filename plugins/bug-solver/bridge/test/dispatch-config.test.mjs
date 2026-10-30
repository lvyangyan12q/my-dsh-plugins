/**
 * 接缝：窗口2 ssh-config 与桥的安全边界。
 * - start 的 allowedRoots = 插件静态配置 ∪ data/ssh-config.json 的 projects[].localPath；
 * - writeback 校验后原子写回 localPath/serviceMap，失败明确报错。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DispatchService } from '../lib/dispatch-service.js'
import { createRedactor } from '../lib/redact.js'
import { readAllowedRootsFromConfig, readSshConfig, resolveSshConfigPath } from '../lib/ssh-config.js'
import { createFakeClock, createFakeGateway, createMemoryStore, makeDraft } from './helpers.mjs'

function setup(t, { config, allowedRoots = [], sshConfig = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'bs-config-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const repo = join(base, 'repo')
  mkdirSync(join(repo, '.git'), { recursive: true })
  const dataDir = join(base, 'data')
  mkdirSync(dataDir)
  const sshConfigPath = join(dataDir, 'ssh-config.json')
  const payload =
    config ??
    {
      version: 2,
      connections: [],
      projects: [{ id: 'proj-api', name: 'api', localPath: repo }],
      links: [],
      serviceMap: [],
    }
  if (sshConfig) writeFileSync(sshConfigPath, JSON.stringify(payload, null, 2), 'utf8')

  const gateway = createFakeGateway()
  const store = createMemoryStore()
  const service = new DispatchService({
    gateway,
    store,
    clock: createFakeClock(),
    redactor: createRedactor(),
    allowedRoots,
    allowedRootsProvider: sshConfig ? () => readAllowedRootsFromConfig(sshConfigPath) : null,
    sshConfigPath: sshConfig ? sshConfigPath : null,
  })
  const draft = (overrides = {}) => {
    const baseDraft = makeDraft()
    return {
      ...baseDraft,
      ...overrides,
      bug: { ...baseDraft.bug, ...(overrides.bug ?? {}) },
      connection: { ...baseDraft.connection, ...(overrides.connection ?? {}) },
      project: { ...baseDraft.project, localPath: repo, ...(overrides.project ?? {}) },
    }
  }
  return { base, repo, sshConfigPath, service, gateway, draft, readConfig: async () => readSshConfig(sshConfigPath) }
}

test('resolveSshConfigPath prefers an explicit path, then projectDir', () => {
  assert.equal(resolveSshConfigPath({ sshConfigPath: 'C:\\cfg\\ssh.json', projectDir: 'C:\\proj' }), 'C:\\cfg\\ssh.json')
  assert.equal(resolveSshConfigPath({ projectDir: 'C:\\proj' }), join('C:\\proj', 'data', 'ssh-config.json'))
})

test('start accepts a repository configured only in window2 ssh-config', async (t) => {
  const h = setup(t, { allowedRoots: [] })
  const { run } = await h.service.start(h.draft())
  assert.equal(run.state, 'fix_planning')
  assert.equal(h.gateway.calls.create[0].cwd, realpathSync(h.repo))
})

test('start still rejects a path that is in neither plugin config nor ssh-config', async (t) => {
  const h = setup(t, { allowedRoots: [] })
  const outside = join(h.base, 'outside')
  mkdirSync(join(outside, '.git'), { recursive: true })

  await assert.rejects(h.service.start(h.draft({ project: { localPath: outside } })), (error) => {
    assert.equal(error.code, 'invalid-draft')
    assert.equal(error.status, 422)
    assert.ok(error.details.some((detail) => detail.code === 'local-path-outside-allowed-roots'))
    return true
  })
  assert.equal(h.gateway.calls.create.length, 0)
})

test('writeback updates localPath and serviceMap after validation', async (t) => {
  const h = setup(t, {
    config: {
      version: 2,
      connections: [],
      projects: [{ id: 'proj-api', name: 'api', localPath: '' }],
      links: [],
      serviceMap: [],
    },
    allowedRoots: [],
  })

  const result = await h.service.writeBack({
    projectId: 'proj-api',
    localPath: h.repo,
    serviceMap: [{ match: ['api-service'], projectId: 'proj-api', container: 'docker-api-1' }],
  })
  assert.equal(result.ok, true)
  assert.equal(result.version, 2)
  assert.equal(result.updated.localPath, realpathSync(h.repo))

  const saved = await h.readConfig()
  assert.equal(saved.version, 2)
  assert.equal(saved.projects[0].localPath, realpathSync(h.repo))
  assert.deepEqual(saved.serviceMap, [
    { match: ['api-service'], projectId: 'proj-api', container: 'docker-api-1' },
  ])

  // 写回后 allowedRoots 自动包含该路径，start 不再 422。
  const { run } = await h.service.start(h.draft())
  assert.equal(run.state, 'fix_planning')
})

test('writeback rejects relative/missing paths and leaves the file untouched', async (t) => {
  const h = setup(t)
  const before = readFileSync(h.sshConfigPath, 'utf8')

  await assert.rejects(h.service.writeBack({ projectId: 'proj-api', localPath: 'relative/repo' }), (error) => {
    assert.equal(error.code, 'local-path-not-absolute')
    assert.equal(error.status, 422)
    return true
  })
  await assert.rejects(
    h.service.writeBack({ projectId: 'proj-api', localPath: join(h.base, 'nope') }),
    (error) => {
      assert.equal(error.code, 'local-path-not-found')
      return true
    },
  )
  assert.equal(readFileSync(h.sshConfigPath, 'utf8'), before)
})

test('writeback rejects unknown projects and duplicate match keys', async (t) => {
  const h = setup(t, {
    config: {
      version: 2,
      connections: [],
      projects: [
        { id: 'proj-api', name: 'api', localPath: '' },
        { id: 'proj-web', name: 'web', localPath: '' },
      ],
      links: [],
      serviceMap: [{ match: ['shared'], projectId: 'proj-web' }],
    },
  })

  await assert.rejects(
    h.service.writeBack({ projectId: 'missing', localPath: h.repo }),
    (error) => {
      assert.equal(error.code, 'project-not-found')
      return true
    },
  )
  await assert.rejects(
    h.service.writeBack({
      projectId: 'proj-api',
      serviceMap: [{ match: ['shared'], projectId: 'proj-api' }],
    }),
    (error) => {
      assert.equal(error.code, 'service-map-duplicate')
      return true
    },
  )
})

test('writeback without sshConfigPath is an explicit 503', async (t) => {
  const h = setup(t, { sshConfig: false })
  await assert.rejects(h.service.writeBack({ projectId: 'proj-api', localPath: h.repo }), (error) => {
    assert.equal(error.code, 'writeback-not-configured')
    assert.equal(error.status, 503)
    return true
  })
})
