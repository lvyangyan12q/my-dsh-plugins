import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  CanvasFormatError,
  canvasFileName,
  canvasReadLimit,
  classifyCanvasTarget,
  parseCanvasDocument,
} from './canvas.ts'
import type {
  CanvasReadView,
  CanvasTargetView,
  ClassroomLectureView,
  ClassroomSpaceView,
  ClassroomView,
  LectureListView,
  LectureReadView,
  NoteDocumentView,
  NoteListView,
  NoteSaveView,
} from './contract.ts'
import { ClassroomError } from './errors.ts'
import { lectureFileKind, lectureFolder, readLectureMeta, sortLectures } from './lectures.ts'
import { defaultLayout, normalizeLayout } from './layout.ts'
import { listNotes, readNote, saveNote } from './notes-io.ts'
import { maxNoteBytes } from './notes.ts'
import { defaultNoteContent, defaultNotePath, spaceCwdPath, spaceDirectoryName, spaceFolders } from './spaces.ts'
import { layoutSchema, type ClassroomState, type ClassroomStateStore, type ClassroomSpace } from './state.ts'
import { inspectVaultRoot, resolveVaultPath, vaultRelativePath, type VaultProbe } from './vault.ts'

export { type ClassroomSpaceView, type ClassroomVaultView, type ClassroomView } from './contract.ts'

export const unsetVaultHint = '请选择一个已存在的本地目录作为知识文件库。'
export const unavailableVaultHint = '请重新选择知识文件库，或修复该目录的访问权限后重试。'

/** Only used to sniff frontmatter while listing; never the whole file. */
const lectureHeadBytes = 16 * 1024
/** Reading a lecture is bounded so a huge file cannot stall the panel. */
const lectureReadLimit = 2 * 1024 * 1024
/** JSON bodies carry note text, so the cap allows one maximal note plus framing. */
const maxRequestBytes = 2 * 1024 * 1024

export const experimentPlaceholder =
  '这是一节动态实验（HTML）。隔离渲染会在后续工单中打开；现在它只出现在目录里，不会把 HTML 直接注入课堂。'

const knownActions = [
  'vault-choose', 'space-create', 'space-open', 'session-open',
  'lecture-list', 'lecture-read', 'note-list', 'note-read', 'note-save', 'canvas-read', 'layout-save',
] as const

const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vault-choose'), path: z.string().min(1).max(4096) }).strict(),
  z.object({ action: z.literal('space-create'), title: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('space-open'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({
    action: z.literal('session-open'),
    spaceId: z.string().min(1).max(64),
    sessionId: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({ action: z.literal('lecture-list'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({ action: z.literal('lecture-read'), spaceId: z.string().min(1).max(64), path: z.string().min(1).max(400) }).strict(),
  z.object({ action: z.literal('layout-save'), spaceId: z.string().min(1).max(64), layout: layoutSchema }).strict(),
  z.object({ action: z.literal('note-list'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({
    action: z.literal('note-read'),
    spaceId: z.string().min(1).max(64),
    path: z.string().min(1).max(1024),
  }).strict(),
  z.object({
    action: z.literal('note-save'),
    spaceId: z.string().min(1).max(64),
    path: z.string().min(1).max(1024),
    content: z.string().max(maxNoteBytes),
    version: z.string().min(1).max(128),
    overwrite: z.boolean().optional(),
  }).strict(),
  z.object({ action: z.literal('canvas-read'), spaceId: z.string().min(1).max(64) }).strict(),
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

  const spaceViews = (root: string | null, spaces: readonly ClassroomSpace[]): ClassroomSpaceView[] =>
    spaces.map(space => ({
      ...space,
      cwd: root === null ? null : spaceCwdPath(root, space.directory),
      // The wire view always carries the optional bindings with defaults, even
      // when an older or hand-written state file reached the store without them.
      lecturePath: space.lecturePath ?? null,
      sessionId: space.sessionId ?? null,
      layout: normalizeLayout(space.layout),
    }))

  const view = async (state: ClassroomState = store.read()): Promise<ClassroomView> => {
    if (state.vaultPath === null) {
      return {
        vault: { path: null, status: 'unset', reason: null, hint: unsetVaultHint },
        spaces: spaceViews(null, state.spaces),
        currentSpaceId: state.currentSpaceId,
      }
    }
    try {
      const canonical = await inspectVaultRoot(state.vaultPath, probe)
      return {
        vault: { path: canonical, status: 'ready', reason: null, hint: '' },
        spaces: spaceViews(canonical, state.spaces),
        currentSpaceId: state.currentSpaceId,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '知识文件库不可访问。'
      return {
        vault: { path: state.vaultPath, status: 'unavailable', reason, hint: unavailableVaultHint },
        spaces: spaceViews(state.vaultPath, state.spaces),
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
      sessionId: null,
      lecturePath: null,
      layout: defaultLayout(),
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

  const spaceOf = (state: ClassroomState, spaceId: string): ClassroomSpace => {
    const space = state.spaces.find(row => row.id === spaceId)
    if (space === undefined) {
      throw new ClassroomError('space-not-found', `学习空间不存在：${spaceId}`, 409)
    }
    return space
  }

  /** Require the registered space folder to still exist and be a directory. */
  const spaceFolderOf = async (root: string, space: ClassroomSpace): Promise<void> => {
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
  }

  /**
   * Record the teacher Session the browser created for one space. The Host
   * never creates or drives the Session here: it only stores the binding so a
   * later visit retains the same Session identity. The space folder must still
   * exist, because that folder is the Session working directory.
   */
  const bindSession = (spaceId: string, sessionId: string): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const next: ClassroomState = {
      ...state,
      currentSpaceId: space.id,
      spaces: state.spaces.map(row => row.id === space.id ? { ...row, sessionId } : row),
    }
    await store.write(next)
    return view(next)
  })

  /**
   * Persist one space's pane widths and collapsed zones. Layout is navigation
   * state, so this never touches the vault and never needs the session.
   */
  const saveLayout = (spaceId: string, layout: unknown): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const space = spaceOf(state, spaceId)
    const parsed = layoutSchema.parse(layout)
    if (JSON.stringify(space.layout) === JSON.stringify(parsed)) return view(state)
    const next: ClassroomState = {
      ...state,
      spaces: state.spaces.map(row => (row.id === space.id ? { ...row, layout: parsed } : row)),
    }
    await store.write(next)
    return view(next)
  })

  /** A lecture path is space-relative, restricted to `讲义/<file>.md|html`. */
  const lecturePathOf = (input: string): { relative: string; fileName: string } => {
    let relative: string
    try {
      relative = vaultRelativePath(input)
    } catch {
      throw new ClassroomError('lecture-invalid', `讲义路径必须是知识文件库内的相对路径：${input}`)
    }
    const segments = relative.split('/')
    if (segments.length !== 2 || segments[0] !== lectureFolder) {
      throw new ClassroomError('lecture-invalid', `讲义路径必须是「${lectureFolder}/文件名.md」或「${lectureFolder}/文件名.html」：${input}`)
    }
    const fileName = segments[1]
    if (lectureFileKind(fileName) === null) {
      throw new ClassroomError('lecture-invalid', `只支持 Markdown 与 HTML 讲义：${input}`)
    }
    return { relative: `${lectureFolder}/${fileName}`, fileName }
  }

  const readHead = async (path: string): Promise<string> => {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(lectureHeadBytes)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  }

  const saveLectureSelection = async (state: ClassroomState, space: ClassroomSpace, lecturePath: string | null): Promise<void> => {
    if (space.lecturePath === lecturePath) return
    const next: ClassroomState = {
      ...state,
      spaces: state.spaces.map(row => (row.id === space.id ? { ...row, lecturePath } : row)),
    }
    await store.write(next)
  }

  /** Derive the course directory from the filesystem; there is no separate manifest. */
  const listLectures = (spaceId: string): Promise<LectureListView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    const folderPath = `${space.directory}/${lectureFolder}`
    const folder = await resolveVaultPath(root, folderPath, probe)

    let names: string[] = []
    let folderMissing = false
    try {
      const rows = await readdir(folder, { withFileTypes: true })
      names = rows.filter(row => row.isFile()).map(row => row.name)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        folderMissing = true
      } else {
        throw new ClassroomError('lecture-list-failed', `无法读取讲义目录：${error instanceof Error ? error.message : '未知原因'}`, 500)
      }
    }

    const lectures: ClassroomLectureView[] = []
    for (const fileName of names) {
      const kind = lectureFileKind(fileName)
      if (kind === null) continue
      const target = await resolveVaultPath(root, `${folderPath}/${fileName}`, probe)
      let head: string
      try {
        head = await readHead(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new ClassroomError('lecture-list-failed', `无法读取讲义文件：${fileName}`, 500)
      }
      const meta = readLectureMeta(fileName, head)
      if (meta === null) continue
      lectures.push({ path: `${lectureFolder}/${fileName}`, fileName, title: meta.title, order: meta.order, kind })
    }

    const sorted = sortLectures(lectures)
    const available = new Set(sorted.map(row => row.path))
    const stored = space.lecturePath ?? null
    const selectedPath = stored !== null && available.has(stored) ? stored : null
    const missingSelection = stored !== null && !available.has(stored) ? stored : null
    // A deleted/renamed lecture clears the stored selection so the next open starts
    // from a clean, actionable state instead of a dangling path.
    if (missingSelection !== null) await saveLectureSelection(state, space, null)

    return { spaceId: space.id, lectures: sorted, selectedPath, missingSelection, folderMissing }
  })

  const readLecture = (spaceId: string, inputPath: string): Promise<LectureReadView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    const { relative, fileName } = lecturePathOf(inputPath)
    const kind = lectureFileKind(fileName)
    if (kind === null) throw new ClassroomError('lecture-invalid', `只支持 Markdown 与 HTML 讲义：${inputPath}`)

    const target = await resolveVaultPath(root, `${space.directory}/${relative}`, probe)
    let info
    try {
      info = await stat(target)
    } catch {
      throw new ClassroomError('lecture-missing', `讲义文件不存在或已被外部删除：${relative}`, 409)
    }
    if (!info.isFile()) {
      throw new ClassroomError('lecture-missing', `讲义路径不是文件：${relative}`, 409)
    }

    let content: string | null = null
    let placeholder: string | null = null
    if (kind === 'markdown') {
      if (info.size > lectureReadLimit) {
        throw new ClassroomError('lecture-too-large', `讲义文件过大（超过 ${Math.round(lectureReadLimit / 1024)} KB）：${relative}`, 413)
      }
      try {
        content = await readFile(target, 'utf8')
      } catch {
        throw new ClassroomError('lecture-read-failed', `读取讲义失败：${relative}`, 500)
      }
    } else {
      placeholder = experimentPlaceholder
    }
    const head = content ?? await readHead(target).catch(() => '')
    const meta = readLectureMeta(fileName, head)
    await saveLectureSelection(state, space, relative)

    return {
      spaceId: space.id,
      path: relative,
      fileName,
      title: meta?.title ?? fileName,
      kind,
      content,
      placeholder,
    }
  })

  const noteList = (spaceId: string) => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    return { notes: await listNotes(root, space.directory, probe), defaultPath: space.notePath }
  })

  const noteRead = (spaceId: string, path: string) => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    return readNote(root, space.directory, path, probe)
  })

  const noteSave = (command: {
    spaceId: string
    path: string
    content: string
    version: string
    overwrite?: boolean
  }) => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, command.spaceId)
    return saveNote(root, space.directory, command.path, command.content, command.version, { overwrite: command.overwrite }, probe)
  })

  /**
   * Resolve one canvas file reference into an openable classroom target. The
   * vault validation is re-done here (never trusting the browser or the file):
   * traversal, absolute paths and links that escape the vault become `outside`,
   * while a missing or non-openable file keeps its node visible with a reason.
   */
  const canvasTargetOf = async (root: string, space: ClassroomSpace, file: string): Promise<CanvasTargetView> => {
    let relative: string
    try {
      relative = vaultRelativePath(file)
    } catch {
      return {
        path: null,
        vaultPath: null,
        kind: null,
        status: 'outside',
        message: `文件节点路径越出知识文件库，无法打开：${file}`,
      }
    }

    const classified = classifyCanvasTarget(relative, space.directory)
    if (classified === null) {
      return {
        path: null,
        vaultPath: relative,
        kind: null,
        status: 'unsupported',
        message: `脉络里的文件节点只能打开本空间的讲义（.md/.html）或笔记（.md）：${relative}`,
      }
    }

    const vaultPath = `${space.directory}/${classified.path}`
    let target: string
    try {
      target = await resolveVaultPath(root, vaultPath, probe)
    } catch {
      return {
        path: classified.path,
        vaultPath,
        kind: classified.kind,
        status: 'outside',
        message: `文件节点路径经符号链接越出知识文件库，无法打开：${relative}`,
      }
    }

    let info
    try {
      info = await stat(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          path: classified.path,
          vaultPath,
          kind: classified.kind,
          status: 'missing',
          message: `无法访问文件节点目标：${vaultPath}`,
        }
      }
      return {
        path: classified.path,
        vaultPath,
        kind: classified.kind,
        status: 'missing',
        message: `文件不存在或已被外部删除：${vaultPath}`,
      }
    }
    if (!info.isFile()) {
      return {
        path: classified.path,
        vaultPath,
        kind: classified.kind,
        status: 'missing',
        message: `文件节点目标不是文件：${vaultPath}`,
      }
    }
    return { path: classified.path, vaultPath, kind: classified.kind, status: 'ok', message: null }
  }

  /** Read `脉络.canvas` read-only; an illegal canvas never yields a partial graph. */
  const readCanvas = (spaceId: string): Promise<CanvasReadView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    const canvasVaultPath = `${space.directory}/${canvasFileName}`
    const target = await resolveVaultPath(root, canvasVaultPath, probe)

    let info
    try {
      info = await stat(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ClassroomError(
          'canvas-missing',
          `学习空间「${space.title}」里还没有「${canvasFileName}」（期望路径：${canvasVaultPath}）。请在 Obsidian 中创建这个画布后刷新脉络；插件内不提供画布编辑。`,
          409,
        )
      }
      throw new ClassroomError('canvas-read-failed', `无法读取脉络文件：${canvasVaultPath}`, 500)
    }
    if (!info.isFile()) {
      throw new ClassroomError('canvas-missing', `脉络路径不是文件：${canvasVaultPath}`, 409)
    }
    if (info.size > canvasReadLimit) {
      throw new ClassroomError('canvas-too-large', `脉络文件过大（超过 ${Math.round(canvasReadLimit / 1024)} KB）：${canvasVaultPath}`, 413)
    }

    let text: string
    try {
      text = await readFile(target, 'utf8')
    } catch {
      throw new ClassroomError('canvas-read-failed', `读取脉络文件失败：${canvasVaultPath}`, 500)
    }

    let parsed
    try {
      parsed = parseCanvasDocument(text)
    } catch (error) {
      const reason = error instanceof CanvasFormatError ? error.reason : '结构无法识别'
      throw new ClassroomError('canvas-invalid', `脉络.canvas 格式不合法：${reason}`, 400)
    }

    const nodes = await Promise.all(parsed.nodes.map(async node => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      color: node.color,
      text: node.text,
      file: node.file,
      url: node.url,
      label: node.label,
      target: node.type === 'file' && node.file !== null ? await canvasTargetOf(root, space, node.file) : null,
    })))

    return {
      spaceId: space.id,
      path: canvasVaultPath,
      fileName: canvasFileName,
      width: parsed.width,
      height: parsed.height,
      nodes,
      edges: parsed.edges.map(edge => ({
        id: edge.id,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        label: edge.label,
        relation: edge.relation,
        selfLoop: edge.selfLoop,
      })),
    }
  })

  const dispatch = async (input: unknown): Promise<
    ClassroomView | LectureListView | LectureReadView | NoteListView | NoteDocumentView | NoteSaveView | CanvasReadView
  > => {
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
      case 'session-open': return bindSession(command.spaceId, command.sessionId)
      case 'lecture-list': return listLectures(command.spaceId)
      case 'lecture-read': return readLecture(command.spaceId, command.path)
      case 'note-list': return noteList(command.spaceId)
      case 'note-read': return noteRead(command.spaceId, command.path)
      case 'note-save': return noteSave(command)
      case 'canvas-read': return readCanvas(command.spaceId)
      case 'layout-save': return saveLayout(command.spaceId, command.layout)
    }
  }

  const readBody = async (req: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > maxRequestBytes) throw new ClassroomError('request-too-large', '请求体过大。', 413)
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
