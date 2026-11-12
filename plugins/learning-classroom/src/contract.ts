import type { CanvasNodeType, CanvasRelation } from './canvas.ts'
import type { ExperimentSpec, ExperimentParameter } from './experiment-spec.ts'
import type { ClassroomLayout } from './layout.ts'

/** Wire contract shared by the Host service and the browser panel. */
export interface ClassroomSpaceView {
  id: string
  title: string
  directory: string
  notePath: string
  createdAt: string
  /** Bound teacher Session for this space, or null before it is opened. */
  sessionId: string | null
  /** Absolute space folder used as the teacher Session working directory, or null when it cannot be derived. */
  cwd: string | null
  /** Last opened course file (space-relative), or null before one is opened. */
  lecturePath: string | null
  /** Existing space files explicitly linked into the course (space-relative). */
  linkedLectures: string[]
  /** Pane widths and collapsed zones, saved per learning space. */
  layout: ClassroomLayout
}

export interface ClassroomVaultView {
  path: string | null
  status: 'unset' | 'ready' | 'unavailable'
  reason: string | null
  hint: string
}

export interface ClassroomView {
  vault: ClassroomVaultView
  spaces: ClassroomSpaceView[]
  currentSpaceId: string | null
}

export type ClassroomLectureKind = 'markdown' | 'experiment'

/** How one course entry entered the directory: the `讲义/` tree or an explicit existing-file link. */
export type ClassroomLectureSource = 'lectures' | 'linked'

/** One file derived from the space's `讲义/` folder or an explicit link to an existing space file. */
export interface ClassroomLectureView {
  /** Space-relative path, e.g. `讲义/第一章/01-缩小样本空间.md` or `资料/概率.md`. */
  path: string
  fileName: string
  title: string
  order: number | null
  kind: ClassroomLectureKind
  /** Chapter label derived from the file's folder; '' is the topic root. */
  chapter: string
  source: ClassroomLectureSource
  /** A linked file that no longer exists (or cannot be reached) on disk. */
  missing: boolean
}

export interface LectureListView {
  spaceId: string
  lectures: ClassroomLectureView[]
  /** Previously opened lecture that still exists on disk. */
  selectedPath: string | null
  /** Previously opened lecture that no longer exists; the UI must offer a next step. */
  missingSelection: string | null
  /** `讲义/` itself is gone (deleted outside the plugin). */
  folderMissing: boolean
}

/** One existing file inside the space folder that can be linked into the course. */
export interface LectureCandidateView {
  /** Space-relative path, e.g. `资料/概率.md`. */
  path: string
  fileName: string
  title: string
  /** Folder shown as the chapter when the file is linked; '' is the space root. */
  chapter: string
}

export interface LectureCandidatesView {
  spaceId: string
  files: LectureCandidateView[]
  /** More files exist than the picker shows; the reader can link by path if needed. */
  truncated: boolean
}

/** The learner's topic goal, stored as a Markdown knowledge file (not plugin state). */
export interface TopicView {
  spaceId: string
  /** Space-relative path of the goal file, e.g. `学习目标.md`. */
  path: string
  title: string
  /** Raw goal text; '' before the learner writes one. */
  goal: string
  /** SHA-256 of the goal text read from disk, or null when the file is missing. */
  version: string | null
  updatedAt: string | null
  /** The goal file itself is gone (deleted or renamed outside the plugin). */
  fileMissing: boolean
}

export interface LectureReadView {
  spaceId: string
  path: string
  fileName: string
  title: string
  kind: ClassroomLectureKind
  /** Markdown body; null for experiments, whose declarative spec is carried in `experiment`. */
  content: string | null
  /** Declarative experiment spec; rendered only by the fixed trusted iframe runtime. */
  experiment: ExperimentSpec | null
  /** Why an experiment file cannot be rendered (legacy arbitrary HTML or malformed spec). */
  experimentError: string | null
  /** Sources declared by a generated experiment. Empty for hand-written files. */
  sources: string[]
  /** Parameters declared by a generated experiment. Empty for Markdown or undeclared files. */
  parameters: ExperimentParameter[]
  /**
   * Content version of the body the Host actually read (SHA-256), used to freeze
   * what a question was asked about. Null for experiments, whose declarative
   * spec is not treated as lecture body.
   */
  version: string | null
}

/** One successfully persisted teacher-authored file. */
export interface GeneratedContentView {
  spaceId: string
  /** Space-relative path, e.g. `讲义/第一章/02-条件概率.md`. */
  path: string
  fileName: string
  title: string
  /** Teacher writes are either a Markdown lecture or an HTML experiment. */
  kind: 'lecture' | 'experiment'
  size: number
  /** SHA-256 of the exact bytes written. */
  version: string
  sources: string[]
  parameters: ExperimentParameter[]
}

/** Commands that return the whole classroom view (navigation/identity state). */
export type ClassroomViewCommand =
  | { action: 'vault-choose'; path: string }
  | { action: 'space-create'; title: string; goal?: string }
  | { action: 'space-open'; spaceId: string }
  | { action: 'session-open'; spaceId: string; sessionId: string }
  | { action: 'layout-save'; spaceId: string; layout: ClassroomLayout }

export type ClassroomCommand =
  | ClassroomViewCommand
  | { action: 'lecture-list'; spaceId: string }
  | { action: 'lecture-read'; spaceId: string; path: string }
  | { action: 'lecture-candidates'; spaceId: string }
  | { action: 'lecture-link'; spaceId: string; path: string }
  | { action: 'lecture-unlink'; spaceId: string; path: string }
  | { action: 'topic-read'; spaceId: string }
  | { action: 'topic-save'; spaceId: string; goal: string; version: string | null }
  | { action: 'canvas-read'; spaceId: string }
  | LinkResolveCommand

export type LayoutSaveCommand = Extract<ClassroomCommand, { action: 'layout-save' }>
export type TopicSaveCommand = Extract<ClassroomCommand, { action: 'topic-save' }>

/** One Markdown note, addressed relative to its learning-space folder. */
export interface NoteSummaryView {
  path: string
  name: string
}

export interface NoteListView {
  notes: NoteSummaryView[]
  defaultPath: string
}

export interface NoteDocumentView {
  path: string
  content: string
  version: string
  updatedAt: string
}

export interface NoteSaveView {
  path: string
  version: string
  savedAt: string
}

export type NoteCommand =
  | { action: 'note-list'; spaceId: string }
  | { action: 'note-read'; spaceId: string; path: string }
  | {
    action: 'note-save'
    spaceId: string
    path: string
    content: string
    /** Version read from the file; the save is refused if the file moved on. */
    version: string
    /** Explicit learner choice to keep their content over an external edit. */
    overwrite?: boolean
  }

export type NoteSaveCommand = Extract<NoteCommand, { action: 'note-save' }>

/** How a wikilink target resolves inside the knowledge vault. */
export type LinkResolveStatus = 'ok' | 'missing' | 'ambiguous' | 'outside' | 'unsupported'

/** What the resolved file means to the classroom: a note, a course file, or just a vault file. */
export type LinkTargetKind = 'note' | 'lecture' | 'file'

/**
 * One wikilink resolved against the real vault. `link` is only set for `ok`:
 * it is the unambiguous Vault-relative link the reader can insert or follow.
 * Missing, ambiguous and out-of-vault targets stay explicit results instead of
 * being guessed at.
 */
export interface LinkResolveView {
  spaceId: string
  /** The target as typed, echoed for display. */
  target: string
  status: LinkResolveStatus
  /** Vault-relative path of the real file, or null when unresolved. */
  file: string | null
  /** Space-relative path when the target lives inside the current learning space. */
  spacePath: string | null
  kind: LinkTargetKind
  heading: string | null
  blockId: string | null
  /** Canonical `[[Vault/relative/path#标题|别名]]`, null unless `status === 'ok'`. */
  link: string | null
  /** Vault-relative candidates when a bare name matches several files. */
  candidates: string[]
  /** Actionable explanation for every non-ok result. */
  message: string | null
}

export type LinkResolveCommand = {
  action: 'link-resolve'
  spaceId: string
  /** Obsidian-style target: `文件`, `文件#标题`, `文件#^块id`, optionally `|别名`. */
  target: string
  /** Space-relative note path that a `[[#标题]]` same-file link refers to. */
  fromPath?: string
}

export type CanvasTargetKind = 'lecture' | 'note'
export type CanvasTargetStatus = 'ok' | 'missing' | 'outside' | 'unsupported'

/** How one canvas file node resolves inside the knowledge vault. */
export interface CanvasTargetView {
  /** Space-relative path used by classroom commands, e.g. `讲义/01.md`. */
  path: string | null
  /** Vault-relative path shown to the reader, e.g. `概率论/讲义/01.md`. */
  vaultPath: string | null
  kind: CanvasTargetKind | null
  status: CanvasTargetStatus
  /** Actionable explanation when the target cannot be opened. */
  message: string | null
}

export interface CanvasNodeView {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color: string | null
  text: string | null
  file: string | null
  url: string | null
  label: string | null
  /** Only file nodes carry an open target; it is null when they cannot. */
  target: CanvasTargetView | null
}

export interface CanvasEdgeView {
  id: string
  fromNode: string
  toNode: string
  label: string | null
  relation: CanvasRelation
  /** A relation from a concept to itself; rendered explicitly, never guessed at. */
  selfLoop: boolean
}

export interface CanvasReadView {
  spaceId: string
  /** Vault-relative canvas path, e.g. `概率论/脉络.canvas`. */
  path: string
  fileName: string
  width: number
  height: number
  nodes: CanvasNodeView[]
  edges: CanvasEdgeView[]
}
