import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
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
  GeneratedContentView,
  LectureCandidatesView,
  LectureCandidateView,
  LectureListView,
  LectureReadView,
  LinkResolveView,
  NoteDocumentView,
  NoteListView,
  NoteSaveView,
  TopicView,
} from './contract.ts'
import { ClassroomError } from './errors.ts'
import {
  composeExperiment,
  composeLecture,
  experimentDraftSchema,
  lectureDraftSchema,
  lectureRelativePath,
  readExperimentMeta,
  type ExperimentDraft,
  type LectureDraft,
} from './teacher-content.ts'
import {
  isHiddenRelativePath,
  lectureBaseName,
  lectureChapterOf,
  lectureFileKind,
  lectureFolder,
  readLectureMeta,
  sortCourseLectures,
  type LectureKind,
} from './lectures.ts'
import { defaultLayout, normalizeLayout } from './layout.ts'
import { buildLinkIndex, resolveVaultLink } from './link-index.ts'
import { listNotes, readNote, saveNote } from './notes-io.ts'
import { maxNoteBytes } from './notes.ts'
import {
  defaultNoteContent,
  defaultNotePath,
  maxTopicBytes,
  spaceCwdPath,
  spaceDirectoryName,
  spaceFolders,
  topicGoalFileName,
} from './spaces.ts'
import { layoutSchema, type ClassroomState, type ClassroomStateStore, type ClassroomSpace } from './state.ts'
import { inspectVaultRoot, nodeVaultProbe, pathInside, resolveVaultPath, vaultRelativePath, type VaultProbe } from './vault.ts'

export { type ClassroomSpaceView, type ClassroomVaultView, type ClassroomView } from './contract.ts'

export const unsetVaultHint = '请选择一个已存在的本地目录作为知识文件库。'
export const unavailableVaultHint = '请重新选择知识文件库，或修复该目录的访问权限后重试。'

/** Only used to sniff frontmatter while listing; never the whole file. */
const lectureHeadBytes = 16 * 1024
/** Reading a lecture is bounded so a huge file cannot stall the panel. */
const lectureReadLimit = 2 * 1024 * 1024
/** Course folders are read recursively; a deeper tree is refused instead of silently cut. */
const lectureDepthLimit = 8
/** One course directory is bounded so a huge tree cannot stall the panel. */
const lectureCountLimit = 1000
/** JSON bodies carry note text, so the cap allows one maximal note plus framing. */
const maxRequestBytes = 2 * 1024 * 1024
/** The association picker is bounded: it lists real files, never walks a link. */
const candidateDepthLimit = 6
const candidateCountLimit = 500
/** Reserved top-level folders that are never course content. */
const nonCourseFolders = [lectureFolder, '笔记', '附件'] as const

/** A failed or cancelled generation cleans its private staging file and never removes an existing target. */
const generationStagingSuffix = '.learning-classroom.tmp'

const knownActions = [
  'vault-choose', 'space-create', 'space-open', 'session-open',
  'lecture-list', 'lecture-read', 'lecture-candidates', 'lecture-link', 'lecture-unlink',
  'topic-read', 'topic-save',
  'note-list', 'note-read', 'note-save', 'canvas-read', 'layout-save',
  'link-resolve',
] as const

const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vault-choose'), path: z.string().min(1).max(4096) }).strict(),
  z.object({
    action: z.literal('space-create'),
    title: z.string().min(1).max(120),
    goal: z.string().max(maxTopicBytes).optional(),
  }).strict(),
  z.object({ action: z.literal('space-open'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({
    action: z.literal('session-open'),
    spaceId: z.string().min(1).max(64),
    sessionId: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({ action: z.literal('lecture-list'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({ action: z.literal('lecture-read'), spaceId: z.string().min(1).max(64), path: z.string().min(1).max(400) }).strict(),
  z.object({ action: z.literal('lecture-candidates'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({ action: z.literal('lecture-link'), spaceId: z.string().min(1).max(64), path: z.string().min(1).max(400) }).strict(),
  z.object({ action: z.literal('lecture-unlink'), spaceId: z.string().min(1).max(64), path: z.string().min(1).max(400) }).strict(),
  z.object({ action: z.literal('topic-read'), spaceId: z.string().min(1).max(64) }).strict(),
  z.object({
    action: z.literal('topic-save'),
    spaceId: z.string().min(1).max(64),
    goal: z.string().max(maxTopicBytes),
    version: z.string().min(1).max(128).nullable(),
  }).strict(),
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
  z.object({
    action: z.literal('link-resolve'),
    spaceId: z.string().min(1).max(64),
    target: z.string().min(1).max(500),
    fromPath: z.string().min(1).max(1024).optional(),
  }).strict(),
])

export interface ClassroomHostOptions {
  store: ClassroomStateStore
  probe?: VaultProbe
  /** Same-origin gate supplied by the DSH connection service in production. */
  rejection?: (req: IncomingMessage) => number | undefined
  /** Test seam for filesystems that reject the atomic no-overwrite link. */
  linkFile?: (existingPath: string, newPath: string) => Promise<void>
}

export interface ClassroomHost {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
  getView(): Promise<ClassroomView>
  /** True when a classroom learning space is bound to this exact Session id. */
  hasBoundSession(sessionId: string): boolean
  /**
   * Persist one teacher-authored lecture or experiment. The Session id is the
   * real executing identity, never a model-supplied topic id.
   */
  writeGenerated(
    sessionId: string,
    kind: 'lecture' | 'experiment',
    draft: LectureDraft | ExperimentDraft,
    options?: { signal?: AbortSignal },
  ): Promise<GeneratedContentView>
  close(): Promise<void>
}

function respond(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function errorBody(error: ClassroomError): { error: string; code: string } {
  return { error: error.message, code: error.code }
}

/** Content hash used to detect an external edit of a knowledge file. */
function contentVersion(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Host-side classroom application: state, vault validation and the HTTP seam. */
export function installClassroom(options: ClassroomHostOptions): ClassroomHost {
  const { store } = options
  const probe = options.probe ?? nodeVaultProbe
  const linkFile = options.linkFile ?? link
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
      linkedLectures: space.linkedLectures ?? [],
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

  const createSpace = (title: string, goal?: string): Promise<ClassroomView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const directory = spaceDirectoryName(title)
    const existing = state.spaces.find(space => space.directory === directory)
    if (existing !== undefined) return view(state)
    if (goal !== undefined && Buffer.byteLength(goal, 'utf8') > maxTopicBytes) {
      throw new ClassroomError('topic-too-large', `学习目标超过 ${Math.round(maxTopicBytes / 1024)} KB 上限。`, 413)
    }
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
      await writeFile(join(staging, topicGoalFileName), goal ?? '', { encoding: 'utf8', flag: 'wx' })
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
      linkedLectures: [],
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
    await spaceFolderOf(root, space)
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

  /**
   * Require the registered space folder itself to be a real directory. `stat`
   * would follow a junction at the space root, so a space A linked to another
   * in-vault topic B would otherwise pass every descendant check; the root
   * component must not be a link at all.
   */
  const spaceFolderOf = async (root: string, space: ClassroomSpace): Promise<void> => {
    const target = await resolveVaultPath(root, space.directory, probe)
    let info
    try {
      info = await lstat(target)
    } catch {
      throw new ClassroomError('space-unavailable', `学习空间文件夹不存在：${space.directory}`, 409)
    }
    if (info.isSymbolicLink()) {
      throw new ClassroomError('space-unavailable', `学习空间目录是符号链接/目录联接，已拒绝：${space.directory}`, 409)
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

  /** A lecture path is space-relative, rooted at `讲义/`; subfolders are chapters. */
  const lecturePathOf = (input: string): LinkedFile => {
    let relative: string
    try {
      relative = vaultRelativePath(input)
    } catch {
      throw new ClassroomError('lecture-invalid', `讲义路径必须是知识文件库内的相对路径：${input}`)
    }
    const segments = relative.split('/')
    const fileName = segments[segments.length - 1] ?? ''
    if (segments.length < 2 || segments[0] !== lectureFolder) {
      throw new ClassroomError('lecture-invalid', `讲义路径必须在「${lectureFolder}/」目录下（可用子目录分章）：${input}`)
    }
    if (isHiddenRelativePath(relative)) {
      throw new ClassroomError('lecture-invalid', `隐藏文件不会进入课程目录：${input}`)
    }
    const kind = lectureFileKind(fileName)
    if (kind === null) {
      throw new ClassroomError('lecture-invalid', `只支持 Markdown 与 HTML 讲义：${input}`)
    }
    return { relative, fileName, kind }
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

  /** One file found under `讲义/`, relative to the space folder. */
  interface FoundLecture {
    relative: string
    fileName: string
    kind: LectureKind
  }

  /**
   * Walk the `讲义/` tree. Directories are real ones only: a symlink or junction
   * entry is never followed, so the directory can never be widened outside the
   * authorized space by a link. Hidden names are skipped on purpose.
   */
  const walkLectureFolder = async (
    folder: string,
    relativeFolder: string,
    depth: number,
    found: FoundLecture[],
  ): Promise<void> => {
    let entries
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch (error) {
      throw new ClassroomError(
        'lecture-list-failed',
        `无法读取讲义目录：${relativeFolder === '' ? lectureFolder : `${lectureFolder}/${relativeFolder}`}（${error instanceof Error ? error.message : '未知原因'}）`,
        500,
      )
    }
    entries.sort((a, b) => {
      const left = a.name.normalize('NFC')
      const right = b.name.normalize('NFC')
      return left < right ? -1 : left > right ? 1 : 0
    })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const relative = relativeFolder === '' ? entry.name : `${relativeFolder}/${entry.name}`
      if (entry.isDirectory()) {
        if (depth >= lectureDepthLimit) {
          throw new ClassroomError('lecture-list-failed', `讲义目录嵌套超过 ${lectureDepthLimit} 层：${lectureFolder}/${relative}`, 409)
        }
        await walkLectureFolder(join(folder, entry.name), relative, depth + 1, found)
        continue
      }
      // `isFile()` is false for symlinks and junctions: never follow them here.
      if (!entry.isFile()) continue
      const kind = lectureFileKind(entry.name)
      if (kind === null) continue
      if (found.length >= lectureCountLimit) {
        throw new ClassroomError('lecture-list-too-large', `讲义文件超过 ${lectureCountLimit} 个：${lectureFolder}`, 413)
      }
      found.push({ relative: `${lectureFolder}/${relative}`, fileName: entry.name, kind })
    }
  }

  /** Read the `讲义/` tree, distinguishing a missing folder from an unreadable one. */
  const readLectureFolder = async (root: string, space: ClassroomSpace): Promise<{ found: FoundLecture[]; folderMissing: boolean }> => {
    const folderRelative = `${space.directory}/${lectureFolder}`
    const folder = await resolveVaultPath(root, folderRelative, probe)
    let info
    try {
      info = await stat(folder)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return { found: [], folderMissing: true }
      throw new ClassroomError('lecture-list-failed', `无法访问讲义目录：${folderRelative}`, 500)
    }
    if (!info.isDirectory()) return { found: [], folderMissing: true }
    let realFolder: string
    try {
      const realSpace = await probe.realpath(await resolveVaultPath(root, space.directory, probe))
      realFolder = await probe.realpath(folder)
      if (!pathInside(realSpace, realFolder)) {
        throw new ClassroomError('lecture-folder-outside', `讲义目录经符号链接越出学习空间：${folderRelative}`, 409)
      }
    } catch (error) {
      if (error instanceof ClassroomError) throw error
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return { found: [], folderMissing: true }
      throw new ClassroomError('lecture-list-failed', `无法访问讲义目录：${folderRelative}`, 500)
    }
    const found: FoundLecture[] = []
    await walkLectureFolder(realFolder, '', 0, found)
    return { found, folderMissing: false }
  }

  interface LinkedFile {
    relative: string
    fileName: string
    kind: LectureKind
  }

  /**
   * Validate a file the learner wants to link into the course. The path is
   * space-relative; the `讲义/` tree is already listed, notes and attachments stay
   * separate, and the topic goal file is not course content.
   */
  const linkedPathOf = (input: string): LinkedFile => {
    let relative: string
    try {
      relative = vaultRelativePath(input)
    } catch {
      throw new ClassroomError('lecture-invalid', `文件路径必须是学习空间内的相对路径：${input}`)
    }
    const segments = relative.split('/')
    const fileName = segments[segments.length - 1] ?? ''
    if (isHiddenRelativePath(relative)) {
      throw new ClassroomError('lecture-invalid', `隐藏文件不能关联到课程目录：${input}`)
    }
    if (relative === topicGoalFileName) {
      throw new ClassroomError('lecture-invalid', `「${topicGoalFileName}」是学习目标文件，不能当作讲义关联：${input}`)
    }
    if (segments[0] === lectureFolder) {
      throw new ClassroomError('lecture-already-listed', `「${lectureFolder}/」里的文件已经出现在课程目录中，无需再关联：${input}`, 409)
    }
    if (segments[0] === '笔记' || segments[0] === '附件') {
      throw new ClassroomError('lecture-invalid', `只能关联讲义类内容，不能关联「${segments[0]}/」里的文件：${input}`)
    }
    const kind = lectureFileKind(fileName)
    if (kind === null) {
      throw new ClassroomError('lecture-invalid', `只能关联 Markdown（.md）或 HTML（.html）文件：${input}`)
    }
    return { relative, fileName, kind }
  }

  /**
   * Prove an existing file's real location is still inside the real space folder.
   * A missing file is reported as `lecture-missing`; a symlink/junction that
   * leaves the space or the vault is refused, never clamped back.
   */
  const resolveSpaceFile = async (root: string, space: ClassroomSpace, relative: string): Promise<string> => {
    let target: string
    try {
      target = await resolveVaultPath(root, `${space.directory}/${relative}`, probe)
    } catch {
      throw new ClassroomError('lecture-invalid', `文件路径越出知识文件库授权范围：${relative}`)
    }
    let realSpace: string
    let realTarget: string
    try {
      realSpace = await probe.realpath(await resolveVaultPath(root, space.directory, probe))
      realTarget = await probe.realpath(target)
    } catch {
      throw new ClassroomError('lecture-missing', `文件不存在或无法访问：${relative}`, 409)
    }
    if (!pathInside(realSpace, realTarget)) {
      throw new ClassroomError('lecture-invalid', `文件路径经符号链接越出学习空间：${relative}`)
    }
    return target
  }

  /** Linked files keep their real path; a vanished file stays visible as missing. */
  const linkedLectureRows = async (root: string, space: ClassroomSpace): Promise<ClassroomLectureView[]> => {
    const rows: ClassroomLectureView[] = []
    for (const relative of space.linkedLectures ?? []) {
      const segments = relative.replaceAll('\\', '/').split('/')
      const fileName = segments[segments.length - 1] ?? ''
      const kind = lectureFileKind(fileName)
      if (kind === null || isHiddenRelativePath(relative)) continue
      if (segments[0] === '笔记' || segments[0] === '附件') continue
      const chapter = lectureChapterOf(relative, 'linked')
      let row: ClassroomLectureView = {
        path: relative,
        fileName,
        title: lectureBaseName(fileName),
        order: null,
        kind,
        chapter,
        source: 'linked',
        missing: true,
      }
      try {
        const target = await resolveSpaceFile(root, space, relative)
        const info = await stat(target)
        if (info.isFile()) {
          const head = await readHead(target).catch(() => '')
          const meta = readLectureMeta(fileName, head)
          row = { ...row, title: meta?.title ?? row.title, order: meta?.order ?? null, missing: false }
        }
      } catch {
        // Keep the learner's link visible with an explicit missing marker.
      }
      rows.push(row)
    }
    return rows
  }

  /** Derive the course directory from the filesystem; there is no separate manifest. */
  const buildLectureList = async (state: ClassroomState, root: string, space: ClassroomSpace): Promise<LectureListView> => {
    const { found, folderMissing } = await readLectureFolder(root, space)

    const lectures: ClassroomLectureView[] = []
    for (const row of found) {
      const target = join(root, space.directory, row.relative)
      let head: string
      try {
        head = await readHead(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new ClassroomError('lecture-list-failed', `无法读取讲义文件：${row.relative}`, 500)
      }
      const meta = readLectureMeta(row.fileName, head)
      if (meta === null) continue
      lectures.push({
        path: row.relative,
        fileName: row.fileName,
        title: meta.title,
        order: meta.order,
        kind: row.kind,
        chapter: lectureChapterOf(row.relative, 'lectures'),
        source: 'lectures',
        missing: false,
      })
    }

    const sorted = sortCourseLectures([...lectures, ...await linkedLectureRows(root, space)])
    // A missing linked file is shown for cleanup but is not an openable selection.
    const available = new Set(sorted.filter(row => !row.missing).map(row => row.path))
    const stored = space.lecturePath ?? null
    const selectedPath = stored !== null && available.has(stored) ? stored : null
    const missingSelection = stored !== null && !available.has(stored) ? stored : null
    // A deleted/renamed lecture clears the stored selection so the next open starts
    // from a clean, actionable state instead of a dangling path.
    if (missingSelection !== null) await saveLectureSelection(state, space, null)

    return { spaceId: space.id, lectures: sorted, selectedPath, missingSelection, folderMissing }
  }

  const listLectures = (spaceId: string): Promise<LectureListView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    return buildLectureList(state, root, space)
  })

  /** Resolve an openable course file: `讲义/…` or a file the learner explicitly linked. */
  const courseFileOf = (space: ClassroomSpace, input: string): LinkedFile => {
    let relative: string
    try {
      relative = vaultRelativePath(input)
    } catch {
      throw new ClassroomError('lecture-invalid', `讲义路径必须是知识文件库内的相对路径：${input}`)
    }
    const segments = relative.split('/')
    if (segments[0] === lectureFolder) return lecturePathOf(relative)
    if ((space.linkedLectures ?? []).includes(relative)) {
      const fileName = segments[segments.length - 1] ?? ''
      const kind = lectureFileKind(fileName)
      if (kind === null || isHiddenRelativePath(relative)) {
        throw new ClassroomError('lecture-invalid', `只支持 Markdown 与 HTML 讲义：${input}`)
      }
      return { relative, fileName, kind }
    }
    throw new ClassroomError('lecture-invalid', `该文件尚未关联到本学习空间：${input}`)
  }

  const readLecture = (spaceId: string, inputPath: string): Promise<LectureReadView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const { relative, fileName, kind } = courseFileOf(space, inputPath)

    const target = await resolveSpaceFile(root, space, relative)
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
    let html: string | null = null
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
      if (info.size > lectureReadLimit) {
        throw new ClassroomError('lecture-too-large', `动态实验文件过大（超过 ${Math.round(lectureReadLimit / 1024)} KB）：${relative}`, 413)
      }
      try {
        html = await readFile(target, 'utf8')
      } catch {
        throw new ClassroomError('lecture-read-failed', `读取动态实验失败：${relative}`, 500)
      }
    }
    const head = content ?? html ?? ''
    const meta = readLectureMeta(fileName, head)
    const experimentMeta = html === null ? { sources: [], parameters: [] } : readExperimentMeta(html)
    await saveLectureSelection(state, space, relative)

    return {
      spaceId: space.id,
      path: relative,
      fileName,
      title: meta?.title ?? fileName,
      kind,
      content,
      html,
      sources: experimentMeta.sources,
      parameters: experimentMeta.parameters,
      // The version belongs to the Markdown body this read returned; an
      // experiment is rendered in an isolated iframe, not as lecture body.
      version: content === null ? null : contentVersion(content),
    }
  })

  /**
   * Existing files inside the space that are not already in the course: the
   * learner picks one and it is linked in place (never copied or moved). The walk
   * stays on real directories and skips the reserved folders.
   */
  const listCandidates = (spaceId: string): Promise<LectureCandidatesView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const folder = await resolveVaultPath(root, space.directory, probe)
    const realFolder = await probe.realpath(folder)
    const linked = new Set(space.linkedLectures ?? [])
    const files: LectureCandidateView[] = []
    const budget = { truncated: false }

    const walk = async (absolute: string, relativeFolder: string, depth: number): Promise<void> => {
      let entries
      try {
        entries = await readdir(absolute, { withFileTypes: true })
      } catch (error) {
        throw new ClassroomError(
          'lecture-candidates-failed',
          `无法读取学习空间目录：${relativeFolder === '' ? space.directory : relativeFolder}（${error instanceof Error ? error.message : '未知原因'}）`,
          500,
        )
      }
      entries.sort((a, b) => {
        const left = a.name.normalize('NFC')
        const right = b.name.normalize('NFC')
        return left < right ? -1 : left > right ? 1 : 0
      })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const relative = relativeFolder === '' ? entry.name : `${relativeFolder}/${entry.name}`
        if (entry.isDirectory()) {
          if (depth === 0 && (nonCourseFolders as readonly string[]).includes(entry.name)) continue
          if (depth >= candidateDepthLimit) continue
          await walk(join(absolute, entry.name), relative, depth + 1)
          continue
        }
        // Symlinks and junctions are never followed, so this picker cannot look
        // outside the space the learner authorized.
        if (!entry.isFile()) continue
        if (relative === topicGoalFileName) continue
        if (lectureFileKind(entry.name) === null || linked.has(relative)) continue
        if (files.length >= candidateCountLimit) {
          budget.truncated = true
          return
        }
        let head = ''
        try {
          head = await readHead(join(absolute, entry.name))
        } catch {
          continue
        }
        const meta = readLectureMeta(entry.name, head)
        files.push({
          path: relative,
          fileName: entry.name,
          title: meta?.title ?? lectureBaseName(entry.name),
          chapter: lectureChapterOf(relative, 'linked'),
        })
      }
    }

    await walk(realFolder, '', 0)
    files.sort((a, b) => (a.path.normalize('NFC') < b.path.normalize('NFC') ? -1 : a.path.normalize('NFC') > b.path.normalize('NFC') ? 1 : 0))
    return { spaceId: space.id, files, truncated: budget.truncated }
  })

  /** Link an existing space file into the course; the file itself is untouched. */
  const linkLecture = (spaceId: string, input: string): Promise<LectureListView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const { relative } = linkedPathOf(input)
    const linked = space.linkedLectures ?? []
    if (linked.includes(relative)) return buildLectureList(state, root, space)
    if (linked.length >= 500) {
      throw new ClassroomError('lecture-link-limit', '一个学习空间最多关联 500 个已有文件。', 409)
    }
    const target = await resolveSpaceFile(root, space, relative)
    let info
    try {
      info = await stat(target)
    } catch {
      throw new ClassroomError('lecture-missing', `文件不存在或无法访问：${relative}`, 409)
    }
    if (!info.isFile()) {
      throw new ClassroomError('lecture-invalid', `只能关联文件，不能关联文件夹：${relative}`)
    }
    const nextLinked = [...linked, relative]
    const nextSpace: ClassroomSpace = { ...space, linkedLectures: nextLinked }
    const next: ClassroomState = {
      ...state,
      spaces: state.spaces.map(row => (row.id === space.id ? nextSpace : row)),
    }
    await store.write(next)
    return buildLectureList(next, root, nextSpace)
  })

  /** Remove one link. The file on disk is never deleted or moved. */
  const unlinkLecture = (spaceId: string, input: string): Promise<LectureListView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    let relative: string
    try {
      relative = vaultRelativePath(input)
    } catch {
      throw new ClassroomError('lecture-invalid', `文件路径必须是学习空间内的相对路径：${input}`)
    }
    const linked = space.linkedLectures ?? []
    if (!linked.includes(relative)) {
      throw new ClassroomError('lecture-not-linked', `该文件没有关联到这个学习空间：${relative}`, 409)
    }
    const nextSpace: ClassroomSpace = {
      ...space,
      linkedLectures: linked.filter(path => path !== relative),
      lecturePath: space.lecturePath === relative ? null : space.lecturePath,
    }
    const next: ClassroomState = {
      ...state,
      spaces: state.spaces.map(row => (row.id === space.id ? nextSpace : row)),
    }
    await store.write(next)
    return buildLectureList(next, root, nextSpace)
  })

  /**
   * The topic goal is a knowledge file at the space root, so Obsidian and the
   * classroom read the same bytes. Reading a goal whose file was deleted is a
   * recoverable state, not an error: the learner can edit and save it again.
   */
  const readTopic = (spaceId: string): Promise<TopicView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const relative = `${space.directory}/${topicGoalFileName}`
    const target = await resolveVaultPath(root, relative, probe)

    const file = await readBoundedTopicFile(target, relative, { code: 'topic-read-failed', label: '读取学习目标失败' })
    if (file === undefined) {
      return {
        spaceId: space.id,
        path: topicGoalFileName,
        title: space.title,
        goal: '',
        version: null,
        updatedAt: null,
        fileMissing: true,
      }
    }
    return {
      spaceId: space.id,
      path: topicGoalFileName,
      title: space.title,
      goal: file.content,
      version: contentVersion(file.content),
      updatedAt: file.updatedAt,
      fileMissing: false,
    }
  })

  /**
   * Read the goal file under an explicit type and size bound. The handle is
   * checked with fstat before any content is read, and at most the stat size is
   * read, so a directory, device or growing file is refused or bounded instead of
   * being read without limit. Returns undefined when the file does not exist.
   */
  const readBoundedTopicFile = async (
    target: string,
    relative: string,
    failure: { code: string; label: string },
  ): Promise<{ content: string; updatedAt: string } | undefined> => {
    let handle
    try {
      handle = await open(target, 'r')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return undefined
      if (code === 'EISDIR' || code === 'EPERM' || code === 'EACCES') {
        throw new ClassroomError('topic-unavailable', `学习目标路径不是可读文件：${relative}`, 409)
      }
      throw new ClassroomError(failure.code, `${failure.label}：无法打开当前文件（${relative}）`, 409)
    }
    try {
      const info = await handle.stat()
      if (!info.isFile()) {
        throw new ClassroomError('topic-unavailable', `学习目标路径不是文件：${relative}`, 409)
      }
      if (info.size > maxTopicBytes) {
        throw new ClassroomError('topic-too-large', `学习目标文件过大（超过 ${Math.round(maxTopicBytes / 1024)} KB）：${relative}`, 413)
      }
      const buffer = Buffer.alloc(info.size)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
        if (bytesRead === 0) break
        offset += bytesRead
      }
      return { content: buffer.subarray(0, offset).toString('utf8'), updatedAt: info.mtime.toISOString() }
    } catch (error) {
      if (error instanceof ClassroomError) throw error
      throw new ClassroomError(failure.code, `${failure.label}：无法读取当前文件（${relative}）`, 409)
    } finally {
      await handle.close()
    }
  }

  /**
   * Save the goal atomically after an explicit version check. The version is the
   * hash of the text the learner read, so an edit made in Obsidian is not
   * silently overwritten; the UI keeps the draft and offers a reload.
   */
  const saveTopic = (spaceId: string, goal: string, version: string | null): Promise<TopicView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    if (Buffer.byteLength(goal, 'utf8') > maxTopicBytes) {
      throw new ClassroomError('topic-too-large', `学习目标超过 ${Math.round(maxTopicBytes / 1024)} KB 上限。`, 413)
    }
    const relative = `${space.directory}/${topicGoalFileName}`
    const target = await resolveVaultPath(root, relative, probe)

    const current = (await readBoundedTopicFile(target, relative, {
      code: 'topic-save-failed',
      label: '保存学习目标失败',
    }))?.content
    if (current === undefined && version !== null) {
      throw new ClassroomError('topic-conflict', '学习目标文件已被外部删除，保存已被拒绝。请重新加载后再保存。', 409)
    }
    if (current !== undefined && (version === null || contentVersion(current) !== version)) {
      throw new ClassroomError('topic-conflict', '学习目标文件已被外部修改，保存已被拒绝。请重新加载后再保存。', 409)
    }

    const directory = dirname(target)
    let directoryInfo
    try {
      directoryInfo = await stat(directory)
    } catch {
      throw new ClassroomError('topic-save-failed', `保存学习目标失败：学习空间文件夹不存在（${space.directory}）。`, 409)
    }
    if (!directoryInfo.isDirectory()) {
      throw new ClassroomError('topic-save-failed', `保存学习目标失败：学习空间路径不是文件夹（${space.directory}）。`, 409)
    }

    const staging = join(directory, `.${topicGoalFileName}.${randomUUID()}.tmp`)
    try {
      await writeFile(staging, goal, { encoding: 'utf8', flag: 'wx' })
      await rename(staging, target)
    } catch (error) {
      await rm(staging, { force: true }).catch(() => undefined)
      throw new ClassroomError('topic-save-failed', `保存学习目标失败：${relative}（${error instanceof Error ? error.message : '未知原因'}）`, 409)
    }
    const saved = await stat(target).catch(() => undefined)
    return {
      spaceId: space.id,
      path: topicGoalFileName,
      title: space.title,
      goal,
      version: contentVersion(goal),
      updatedAt: saved?.mtime.toISOString() ?? new Date().toISOString(),
      fileMissing: false,
    }
  })

  /** Read-only identity probe used for step-time tool visibility. */
  const hasBoundSession = (sessionId: string): boolean => {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return false
    try {
      return store.read().spaces.some(space => space.sessionId === sessionId)
    } catch {
      return false
    }
  }

  /**
   * Resolve the executing Session to exactly one bound learning space. The
   * model never supplies a topic id: an unbound or ambiguous Session is refused
   * before any path or content is considered.
   */
  const spaceOfSession = (state: ClassroomState, sessionId: string): ClassroomSpace => {
    const matches = state.spaces.filter(space => space.sessionId === sessionId)
    if (matches.length === 0) {
      throw new ClassroomError(
        'session-unbound',
        '这个老师会话还没有绑定到学习空间，不能生成讲义或实验。请先在课堂里打开老师会话并保存绑定。',
        409,
      )
    }
    if (matches.length > 1) {
      throw new ClassroomError('session-ambiguous', '同一个老师会话绑定了多个学习空间，已拒绝写入；请重新绑定后再试。', 409)
    }
    return matches[0]
  }

  /**
   * Persist one teacher-authored file. Content is fully composed and validated
   * before a hidden staging file is written; publication is a no-overwrite link
   * (or exclusive copy on filesystems without hard links), so an existing
   * lecture is never replaced and a failed/cancelled write leaves no visible
   * half-file.
   */
  const writeGenerated = (
    sessionId: string,
    kind: 'lecture' | 'experiment',
    draft: LectureDraft | ExperimentDraft,
    options: { signal?: AbortSignal } = {},
  ): Promise<GeneratedContentView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOfSession(state, sessionId)
    await spaceFolderOf(root, space)

    const ensureLive = (): void => {
      if (options.signal?.aborted === true) {
        throw new ClassroomError('generation-cancelled', '生成已取消，没有写入任何文件。', 409)
      }
    }

    let relative: string
    let content: string
    let title: string
    let sources: string[]
    let parameters: ExperimentDraft['parameters']
    try {
      relative = lectureRelativePath(draft.fileName)
      const actualKind = lectureFileKind(relative.split('/').pop() ?? '')
      const expectedKind = kind === 'lecture' ? 'markdown' : 'experiment'
      if (actualKind !== expectedKind) {
        throw new ClassroomError(
          'generation-kind-mismatch',
          kind === 'lecture' ? '生成讲义必须使用 .md 文件。' : '生成动态实验必须使用 .html 文件。',
        )
      }
      if (kind === 'lecture') {
        const lecture = lectureDraftSchema.parse(draft)
        content = composeLecture(lecture)
        title = lecture.title
        sources = lecture.sources
        parameters = []
      } else {
        const experiment = experimentDraftSchema.parse(draft)
        content = composeExperiment(experiment)
        title = experiment.title
        sources = experiment.sources
        parameters = experiment.parameters
      }
    } catch (error) {
      if (error instanceof ClassroomError) throw error
      const message = error instanceof z.ZodError
        ? error.issues.map(issue => issue.message).join('；')
        : error instanceof Error ? error.message : '生成内容不合法。'
      throw new ClassroomError('generation-invalid', `生成内容不合法：${message}`)
    }
    if (Buffer.byteLength(content, 'utf8') > lectureReadLimit) {
      throw new ClassroomError('generation-too-large', `生成文件超过 ${Math.round(lectureReadLimit / 1024)} KB 上限，未写入。`, 413)
    }

    // Lexical validation first; all later filesystem work uses the canonical
    // space root plus the validated relative segments, not the client-shaped path.
    await resolveVaultPath(root, `${space.directory}/${relative}`, probe)
    ensureLive()
    const realSpace = await probe.realpath(await resolveVaultPath(root, space.directory, probe))
    // Refuse a symlink/junction anywhere under the lecture root before creating
    // any directory: a link to another topic must not even leave an empty folder.
    let cursor = realSpace
    const pathSegments = relative.split('/')
    for (let index = 0; index < pathSegments.length - 1; index += 1) {
      cursor = join(cursor, pathSegments[index])
      const ancestor = await lstat(cursor).catch(() => undefined)
      if (ancestor === undefined) break
      if (ancestor.isSymbolicLink()) {
        throw new ClassroomError('generation-outside', `生成路径经符号链接进入其他位置，已拒绝：${relative}`, 409)
      }
      if (!ancestor.isDirectory()) {
        throw new ClassroomError('generation-failed', `讲义路径的上级不是文件夹：${relative}`, 409)
      }
    }
    const canonicalFolder = join(realSpace, ...pathSegments.slice(0, -1))
    let directoryInfo
    try {
      directoryInfo = await stat(canonicalFolder)
    } catch {
      directoryInfo = undefined
    }
    if (directoryInfo === undefined) {
      // A missing chapter folder is created only after the content passed all
      // validation; an aborted/failed write never publishes a lecture file.
      await mkdir(canonicalFolder, { recursive: true })
    } else if (!directoryInfo.isDirectory()) {
      throw new ClassroomError('generation-failed', `讲义路径的上级不是文件夹：${relative}`, 409)
    }

    const realFolder = await probe.realpath(canonicalFolder)
    if (!pathInside(realSpace, realFolder)) {
      throw new ClassroomError('generation-outside', `生成路径经符号链接越出学习空间：${relative}`, 409)
    }
    const folderInfo = await stat(realFolder)
    if (!folderInfo.isDirectory()) {
      throw new ClassroomError('generation-failed', `讲义路径的上级不是文件夹：${relative}`, 409)
    }
    const folderIdentity = `${String(folderInfo.dev)}:${String(folderInfo.ino)}`
    const fileName = relative.split('/').pop() ?? relative
    // All writes go through the canonical folder, never the client-shaped path.
    const realTarget = join(realFolder, fileName)
    const existing = await lstat(realTarget).catch(() => undefined)
    if (existing !== undefined) {
      throw new ClassroomError(
        'lecture-exists',
        `讲义目录里已存在同名文件：${relative}。没有覆盖它；请换一个文件名后重试。`,
        409,
      )
    }

    const staging = join(realFolder, `.${randomUUID()}${generationStagingSuffix}`)
    try {
      ensureLive()
      await writeFile(staging, content, { encoding: 'utf8', flag: 'wx' })
      ensureLive()
      // Directory identity checks narrow the local replacement window: the
      // canonical folder and the canonical staging path must still be the same
      // directory before publication. Node's fs exposes no dirfd/openat, so a
      // local process that replaces an ancestor between this check and `link`
      // is outside the supported boundary; static links are rejected above.
      const current = await stat(realFolder)
      if (`${String(current.dev)}:${String(current.ino)}` !== folderIdentity) {
        throw new ClassroomError('generation-outside', `生成目录在写入期间被替换，已拒绝发布：${relative}`, 409)
      }
      const realStaging = await probe.realpath(staging)
      if (!pathInside(realFolder, realStaging)) {
        throw new ClassroomError('generation-outside', `生成暂存文件经符号链接离开学习空间，已拒绝：${relative}`, 409)
      }
      try {
        // A hard link publishes the complete staging file atomically and fails
        // if the target appeared meanwhile; the existing file is never touched.
        await linkFile(staging, realTarget)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
          throw new ClassroomError(
            'lecture-exists',
            `讲义目录里已存在同名文件：${relative}。没有覆盖它；请换一个文件名后重试。`,
            409,
          )
        }
        // Never fall back to a copy: a copy can expose a half-written file and
        // its cleanup could delete a file another process created meanwhile.
        // Filesystems without an atomic no-overwrite link fail closed.
        throw new ClassroomError(
          'generation-publish-unsupported',
          `当前文件系统无法无覆盖原子发布生成文件（${code ?? '未知错误'}）；未写入任何文件，也不会退化为复制。`,
          500,
        )
      }
      await rm(staging, { force: true }).catch(() => undefined)
    } catch (error) {
      await rm(staging, { force: true }).catch(() => undefined)
      if (error instanceof ClassroomError) throw error
      throw new ClassroomError(
        'generation-failed',
        `写入生成文件失败：${relative}（${error instanceof Error ? error.message : '未知原因'}）。没有覆盖任何已有文件。`,
        500,
      )
    }

    return {
      spaceId: space.id,
      path: relative,
      fileName,
      title,
      kind,
      size: Buffer.byteLength(content, 'utf8'),
      version: contentVersion(content),
      sources,
      parameters,
    }
  })

  const noteList = (spaceId: string) => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    return { notes: await listNotes(root, space.directory, probe), defaultPath: space.notePath }
  })

  const noteRead = (spaceId: string, path: string) => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
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
    await spaceFolderOf(root, space)
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
    await spaceFolderOf(root, space)
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

  /** Resolve one Obsidian-style wikilink against the real vault, read-only. */
  const resolveLink = (spaceId: string, target: string, fromPath?: string): Promise<LinkResolveView> => enqueue(async () => {
    const state = store.read()
    const root = await requireVault(state)
    const space = spaceOf(state, spaceId)
    await spaceFolderOf(root, space)
    const index = await buildLinkIndex(root, probe)
    return resolveVaultLink({
      root,
      index,
      space: { directory: space.directory, linkedLectures: space.linkedLectures ?? [] },
      spaceId: space.id,
      target,
      fromPath,
      probe,
    })
  })

  const dispatch = async (input: unknown): Promise<
    | ClassroomView
    | LectureListView
    | LectureReadView
    | LectureCandidatesView
    | TopicView
    | NoteListView
    | NoteDocumentView
    | NoteSaveView
    | CanvasReadView
    | LinkResolveView
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
      case 'space-create': return createSpace(command.title, command.goal)
      case 'space-open': return openSpace(command.spaceId)
      case 'session-open': return bindSession(command.spaceId, command.sessionId)
      case 'lecture-list': return listLectures(command.spaceId)
      case 'lecture-read': return readLecture(command.spaceId, command.path)
      case 'lecture-candidates': return listCandidates(command.spaceId)
      case 'lecture-link': return linkLecture(command.spaceId, command.path)
      case 'lecture-unlink': return unlinkLecture(command.spaceId, command.path)
      case 'topic-read': return readTopic(command.spaceId)
      case 'topic-save': return saveTopic(command.spaceId, command.goal, command.version)
      case 'note-list': return noteList(command.spaceId)
      case 'note-read': return noteRead(command.spaceId, command.path)
      case 'note-save': return noteSave(command)
      case 'canvas-read': return readCanvas(command.spaceId)
      case 'link-resolve': return resolveLink(command.spaceId, command.target, command.fromPath)
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
    hasBoundSession,
    writeGenerated,
    close: async () => {
      if (closed) return
      closed = true
      await tail.catch(() => undefined)
      await store.close()
    },
  }
}
