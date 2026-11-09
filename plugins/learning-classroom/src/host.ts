import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { ClassroomError } from './errors.ts'
import { defaultNoteContent, defaultNotePath, spaceDirectoryName, spaceFolders } from './spaces.ts'
import type { ClassroomState, ClassroomStateStore, ClassroomSpace } from './state.ts'
import { inspectVaultRoot, resolveVaultPath, type VaultProbe } from './vault.ts'

export const unsetVaultHint = '请选择一个已存在的本地目录作为知识文件库。'
export const unavailableVaultHint = '请重新选择知识文件库，或修复该目录的访问权限后重试。'

export interface ClassroomVaultView {
  path: string | null
  status: 'unset' | 'ready' | 'unavailable'
  reason: string | null
  hint: string
}

export interface ClassroomView {
  vault: ClassroomVaultView
  spaces: ClassroomState['spaces']
  currentSpaceId: string | null
}

const knownActions = ['vault-choose', 'space-create', 'space-open'] as const

const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vault-choose'), path: z.string().min(1).max(4096) }).strict(),
  z.object({ action: z.literal('space-create'), title: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('space-open'), spaceId: z.string().min(1).max(64) }).strict(),
])

export interface ClassroomHostOptions {
  store: ClassroomStateStore
  probe?: VaultProbe
  /** Same-origin gate supplied by the DSH connection service in production. */
  rejection?: (req: IncomingMessage) => number | undefined
}

export interface ClassroomHost {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
  getView(): Promise<ClassroomView>
  close(): Promise<void>
}

function respond(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function errorBody(error: ClassroomError): { error: string; code: string } {
  return { error: error.message, code: error.code }
}

/** Host-side classroom application: state, vault validation and the HTTP seam. */
export function installClassroom(options: ClassroomHostOptions): ClassroomHost {
  const { store, probe } = options
  let closed = false
  let tail: Promise<unknown> = Promise.resolve()

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const task = tail.then(job, job)
    tail = task.then(() => undefined, () => undefined)
    return task
  }

  const view = async (state: ClassroomState = store.read()): Promise<ClassroomView> => {
    if (state.vaultPath === null) {
      return {
        vault: { path: null, status: 'unset', reason: null, hint: unsetVaultHint },
        spaces: state.spaces,
        currentSpaceId: state.currentSpaceId,
      }
    }
    try {
      await inspectVaultRoot(state.vaultPath, probe)
      return {
        vault: { path: state.vaultPath, status: 'ready', reason: null, hint: '' },
        spaces: state.spaces,
        currentSpaceId: state.currentSpaceId,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '知识文件库不可访问。'
      return {
        vault: { path: state.vaultPath, status: 'unavailable', reason, hint: unavailableVaultHint },
        spaces: state.spaces,
        currentSpaceId: state.currentSpaceId,
      }
    }
  }

  const chooseVault = (path: string): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const canonical = await inspectVaultRoot(path, probe)
    const next: ClassroomState = state.vaultPath === canonical
      ? { ...state, vaultPath: canonical }
      : { ...state, vaultPath: canonical, spaces: [], currentSpaceId: null }
    await store.write(next)
    return view(next)
  })

  const requireVault = async (state: ClassroomState): Promise<string> => {
    if (state.vaultPath === null) {
      throw new ClassroomError('vault-unset', '还没有选择知识文件库。请先选择一个已存在的目录作为知识文件库。', 409)
    }
    try {
      return await inspectVaultRoot(state.vaultPath, probe)
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知原因'
      throw new ClassroomError('vault-unavailable', `知识文件库不可访问：${reason}`, 409)
    }
  }

  const createSpace = (title: string): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const directory = spaceDirectoryName(title)
    const existing = state.spaces.find(space => space.directory === directory)
    if (existing !== undefined) return view(state)

    const target = await resolveVaultPath(root, directory, probe)
    let occupied = false
    try {
      await lstat(target)
      occupied = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ClassroomError('space-create-failed', `无法检查学习空间目录：${directory}`, 500)
      }
    }
    if (occupied) {
      throw new ClassroomError('space-directory-exists', `知识文件库中已存在同名目录「${directory}」，但未登记为学习空间；请换一个名称。`, 409)
    }

    // Stage the whole space in a hidden sibling, then rename. A failed or
    // interrupted create leaves no half-written space folder behind.
    const staging = join(dirname(target), `.learning-classroom-${randomUUID()}.tmp`)
    try {
      await mkdir(staging)
      for (const folder of spaceFolders) await mkdir(join(staging, folder))
      await writeFile(join(staging, defaultNotePath), defaultNoteContent, { encoding: 'utf8', flag: 'wx' })
      await rename(staging, target)
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
        throw new ClassroomError('space-directory-exists', `知识文件库中已存在同名目录「${directory}」，但未登记为学习空间；请换一个名称。`, 409)
      }
      throw new ClassroomError('space-create-failed', `创建学习空间失败：${error instanceof Error ? error.message : '未知原因'}`, 500)
    }

    const space: ClassroomSpace = {
      id: randomUUID(),
      title: title.trim(),
      directory,
      notePath: defaultNotePath,
      createdAt: new Date().toISOString(),
    }
    const next: ClassroomState = { ...state, spaces: [...state.spaces, space], currentSpaceId: space.id }
    try {
      await store.write(next)
    } catch (error) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined)
      throw new ClassroomError('space-create-failed', `保存学习空间失败：${error instanceof Error ? error.message : '未知原因'}`, 500)
    }
    return view(next)
  })

  const openSpace = (spaceId: string): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = state.spaces.find(row => row.id === spaceId)
    if (space === undefined) {
      throw new ClassroomError('space-not-found', `学习空间不存在：${spaceId}`, 409)
    }
    const target = await resolveVaultPath(root, space.directory, probe)
    let info
    try {
      info = await stat(target)
    } catch {
      throw new ClassroomError('space-unavailable', `学习空间文件夹不存在：${space.directory}`, 409)
    }
    if (!info.isDirectory()) {
      throw new ClassroomError('space-unavailable', `学习空间路径不是文件夹：${space.directory}`, 409)
    }
    const next: ClassroomState = { ...state, currentSpaceId: space.id }
    await store.write(next)
    return view(next)
  })

  const dispatch = async (input: unknown): Promise<ClassroomView> => {
    const parsed = commandSchema.safeParse(input)
    if (!parsed.success) {
      const action = input !== null && typeof input === 'object' ? (input as { action?: unknown }).action : undefined
      if (action !== undefined && !knownActions.includes(action as typeof knownActions[number])) {
        throw new ClassroomError('unknown-action', `未知命令：${String(action)}`)
      }
      throw new ClassroomError('invalid-command', '命令字段不合法；只接受 action 与已声明的字段。')
    }
    const command = parsed.data
    switch (command.action) {
      case 'vault-choose': return chooseVault(command.path)
      case 'space-create': return createSpace(command.title)
      case 'space-open': return openSpace(command.spaceId)
    }
  }

  const readBody = async (req: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > 16 * 1024) throw new ClassroomError('request-too-large', '请求体过大。', 413)
      chunks.push(bytes)
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new ClassroomError('invalid-json', '请求体不是合法 JSON。')
    }
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (closed) {
        respond(res, 503, { error: '学习课堂暂不可用。', code: 'unavailable' })
        return
      }
      const rejection = options.rejection?.(req)
      if (rejection !== undefined) {
        respond(res, rejection, { error: '需要来自同一来源的已认证请求。', code: 'rejected' })
        return
      }
      if (req.method === 'GET') {
        respond(res, 200, await enqueue(() => view()))
        return
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST')
        respond(res, 405, { error: '只支持 GET 与 POST。', code: 'method-not-allowed' })
        return
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        respond(res, 415, { error: '请求必须是 JSON。', code: 'json-required' })
        return
      }
      const input = await readBody(req)
      respond(res, 200, await dispatch(input))
    } catch (error) {
      if (error instanceof ClassroomError) {
        respond(res, error.status, errorBody(error))
        return
      }
      respond(res, 500, { error: '学习课堂操作失败。', code: 'internal' })
    }
  }

  return {
    handle,
    getView: () => enqueue(() => view()),
    close: async () => {
      if (closed) return
      closed = true
      await tail.catch(() => undefined)
      await store.close()
    },
  }
}
