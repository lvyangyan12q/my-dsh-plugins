import type { Context } from '@deepseek-ai/cordis'
import type { StudyWorkspace } from './study-workspace.ts'
import type { StudySources } from './study-sources.ts'
import type { StudyRoles } from './study-roles.ts'
import type { StudyTeaching } from './study-teaching.ts'

/** A small authenticated study command boundary, separate from business routes
 * which always require a Host-registered viewId. */
export function mountStudyHttp(ctx: Context, workspace: StudyWorkspace, sources: StudySources, roles: StudyRoles, teaching: StudyTeaching) {
  return ctx.webServer.register({ kind: 'exact', path: '/api/kaogong/study', handler: async (req, res) => {
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { send(admission.rejection, { error: '请登录当前DSH' }); return }
    try {
      if (req.method === 'GET') { send(200, await workspace.list()); return }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { send(405, { error: 'POST JSON required' }); return }
      let text = ''
      for await (const chunk of req) { text += chunk.toString(); if (text.length > 180000) throw Error('学习请求过大') }
      const body = JSON.parse(text || '{}')
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('学习请求格式无效')
      if (body.action === 'create') {
        if (Object.keys(body).some(key => !['action', 'title', 'kind', 'confirmed'].includes(key))) throw Error('不能指定档案身份')
        send(200, await workspace.create(body.title, body.kind, body.confirmed)); return
      }
      if (body.action === 'open') {
        if (Object.keys(body).some(key => !['action', 'profileId'].includes(key))) throw Error('打开档案参数无效')
        send(200, await workspace.open(body.profileId)); return
      }
      if (body.action === 'session-context') {
        if (Object.keys(body).some(key => !['action', 'viewId', 'sessionId'].includes(key)) || typeof body.sessionId !== 'string') throw Error('原生课堂上下文无效')
        if (!('viewId' in body)) { send(200, await roles.restoredSessionContext(body.sessionId)); return }
        if (typeof body.viewId !== 'string') throw Error('需要已登记的学习视图')
        const context = await workspace.resolveView(body.viewId)
        send(200, { profile: context.profile, view: { id: context.view.id, profileId: context.instance.id }, ...await roles.sessionContext(context.instance.id, body.sessionId) }); return
      }
      if (typeof body.viewId !== 'string') throw Error('需要已登记的学习视图')
      const context = await workspace.resolveView(body.viewId)
      if (typeof body.action === 'string' && body.action.startsWith('task-')) {
        const fields: Record<string, string[]> = {
          'task-list': [], 'task-prepare': ['roleId', 'text', 'contexts'], 'task-prepare-owned': ['roleId', 'kind', 'payload'],
          'task-edit': ['id', 'revision', 'text', 'contexts'], 'task-submit': ['id', 'revision'], 'task-discard': ['id', 'revision'], 'task-recover': ['id'],
        }
        const allowed = fields[body.action]
        if (!allowed || Object.keys(body).some(key => !['action', 'viewId', ...allowed].includes(key))) throw Error('不能在教学请求中另选档案、Session或准入结果')
        let value
        switch (body.action) {
          case 'task-list': value = await teaching.list(body.viewId); break
          case 'task-prepare': value = await teaching.prepare(body.viewId, body); break
          case 'task-prepare-owned': value = await teaching.prepareOwned(body.viewId, body); break
          case 'task-edit': value = await teaching.edit(body.viewId, body.id, body.revision, body.text, body.contexts); break
          case 'task-submit': value = await teaching.submit(body.viewId, body.id, body.revision); break
          case 'task-discard': value = await teaching.discard(body.viewId, body.id, body.revision); break
          case 'task-recover': value = await teaching.recover(body.viewId, body.id); break
        }
        send(200, value); return
      }
      if (['role-read', 'role-ensure', 'role-open'].includes(body.action)) {
        const allowed = body.action === 'role-open' ? ['action', 'viewId', 'roleId', 'sessionId', 'revision'] : ['action', 'viewId', 'roleId']
        if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.roleId !== 'string') throw Error('角色操作参数无效')
        if (body.action === 'role-read') send(200, await roles.read(context.instance.id, body.roleId))
        else if (body.action === 'role-ensure') send(200, await roles.ensure(context.instance.id, body.roleId, body.viewId))
        else send(200, await roles.open(context.instance.id, body.roleId, body.sessionId, body.revision))
        return
      }
      if (body.action === 'source-list') {
        if (Object.keys(body).some(key => !['action', 'viewId'].includes(key))) throw Error('资料列表参数无效')
        const snapshot = await workspace.list()
        send(200, { libraries: snapshot.profiles.filter(row => row.kind === 'library').map(row => ({ profileId: row.id, title: row.title, viewId: snapshot.views.find(view => view.profileId === row.id)?.id })), connections: [...workspace.domain.table('grants').entries()].map(([, row]) => row).filter(row => row.consumerInstanceId === context.instance.id).map(row => ({ ...row, ownerProfileId: row.ownerInstanceId })) }); return
      }
      if (body.action === 'source-share') {
        if (Object.keys(body).some(key => !['action', 'viewId', 'ownerViewId', 'resourceId'].includes(key))) throw Error('资料授权参数无效')
        send(200, await sources.share({ ownerViewId: body.ownerViewId, consumerInstanceId: context.instance.id, resourceId: body.resourceId })); return
      }
      if (body.action === 'source-revoke') {
        if (Object.keys(body).some(key => !['action', 'viewId', 'id', 'revision'].includes(key))) throw Error('资料撤销参数无效')
        const grant = workspace.domain.table('grants').get(body.id)
        if (!grant || grant.consumerInstanceId !== context.instance.id && grant.ownerInstanceId !== context.instance.id) throw Error('资料授权不属于当前档案')
        send(200, await sources.revoke(body.id, body.revision)); return
      }
      throw Error('未知学习操作')
    } catch (error) { send(409, { error: error instanceof Error ? error.message : '学习操作失败' }) }
  } })
}
