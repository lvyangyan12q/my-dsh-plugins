import type { CanvasNodeType, CanvasRelation } from './canvas.ts'

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

/** One file derived from the space's `讲义/` folder. */
export interface ClassroomLectureView {
  /** Space-relative path, e.g. `讲义/01-缩小样本空间.md`. */
  path: string
  fileName: string
  title: string
  order: number | null
  kind: ClassroomLectureKind
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

export interface LectureReadView {
  spaceId: string
  path: string
  fileName: string
  title: string
  kind: ClassroomLectureKind
  /** Markdown body; null for experiments, which are not inlined into the DOM. */
  content: string | null
  /** Understandable stand-in copy for experiments until isolated rendering ships. */
  placeholder: string | null
}

export type ClassroomCommand =
  | { action: 'vault-choose'; path: string }
  | { action: 'space-create'; title: string }
  | { action: 'space-open'; spaceId: string }
  | { action: 'session-open'; spaceId: string; sessionId: string }
  | { action: 'lecture-list'; spaceId: string }
  | { action: 'lecture-read'; spaceId: string; path: string }
  | { action: 'canvas-read'; spaceId: string }

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
