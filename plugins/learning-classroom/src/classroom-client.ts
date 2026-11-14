import type {
  CanvasReadView,
  ClassroomCommand,
  ClassroomSpaceView,
  ClassroomView,
  ClassroomViewCommand,
  LayoutSaveCommand,
  LectureCandidatesView,
  LectureListView,
  LectureReadView,
  LinkResolveCommand,
  LinkResolveView,
  NoteCommand,
  NoteDocumentView,
  NoteListView,
  NoteSaveCommand,
  NoteSaveView,
  NoteSelectCommand,
  PositionSaveCommand,
  SummarySaveCommand,
  SummaryView,
  TopicSaveCommand,
  TopicView,
} from './contract.ts'

export const classroomEndpoint = '/api/learning-classroom'

/** Business error crossing the classroom HTTP boundary, with its machine code. */
export class ClassroomClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ClassroomClientError'
  }
}

/** Read the business code from any thrown value, without requiring our class. */
export function classroomErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export interface ClassroomClient {
  load(signal?: AbortSignal): Promise<ClassroomView>
  command(input: ClassroomViewCommand, signal?: AbortSignal): Promise<ClassroomView>
  listLectures(spaceId: string, signal?: AbortSignal): Promise<LectureListView>
  readLecture(spaceId: string, path: string, signal?: AbortSignal): Promise<LectureReadView>
  /**
   * Topic goal and existing-file association. Optional so an injected/older
   * client can omit them; the panel then hides those affordances instead of
   * pretending they work.
   */
  readTopic?(spaceId: string, signal?: AbortSignal): Promise<TopicView>
  saveTopicGoal?(input: TopicSaveCommand, signal?: AbortSignal): Promise<TopicView>
  /**
   * Explicit learning summary and next step. Optional so an older injected
   * client simply hides the continuity card instead of pretending it saved.
   */
  readSummary?(spaceId: string, signal?: AbortSignal): Promise<SummaryView>
  saveSummary?(input: SummarySaveCommand, signal?: AbortSignal): Promise<SummaryView>
  /** Persist the last reading offset for one course file (navigation state only). */
  saveReadingPosition?(input: PositionSaveCommand, signal?: AbortSignal): Promise<ClassroomSpaceView>
  /** Remember the note file the learner opened last (navigation state only). */
  selectNote?(input: NoteSelectCommand, signal?: AbortSignal): Promise<ClassroomSpaceView>
  listLectureCandidates?(spaceId: string, signal?: AbortSignal): Promise<LectureCandidatesView>
  linkLecture?(spaceId: string, path: string, signal?: AbortSignal): Promise<LectureListView>
  unlinkLecture?(spaceId: string, path: string, signal?: AbortSignal): Promise<LectureListView>
  listNotes(spaceId: string, signal?: AbortSignal): Promise<NoteListView>
  readNote(spaceId: string, path: string, signal?: AbortSignal): Promise<NoteDocumentView>
  saveNote(input: NoteSaveCommand, signal?: AbortSignal): Promise<NoteSaveView>
  readCanvas(spaceId: string, signal?: AbortSignal): Promise<CanvasReadView>
  saveLayout(input: LayoutSaveCommand, signal?: AbortSignal): Promise<ClassroomView>
  /** Resolve an Obsidian-style wikilink; optional so an older client hides the affordance. */
  resolveLink?(input: LinkResolveCommand, signal?: AbortSignal): Promise<LinkResolveView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function payload<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => undefined) as { error?: string; code?: string } | undefined
  if (!response.ok) {
    throw new ClassroomClientError(
      body?.code ?? 'request-failed',
      body?.error ?? `学习课堂请求失败（HTTP ${response.status}）`,
      response.status,
    )
  }
  return body as T
}

/** Browser boundary for the single classroom HTTP entry. */
export function createClassroomClient(fetchImpl: FetchLike = (input, init) => fetch(input, init)): ClassroomClient {
  const post = async <T>(input: ClassroomCommand | NoteCommand, signal?: AbortSignal): Promise<T> => payload<T>(await fetchImpl(classroomEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  }))

  return {
    load: async signal => payload<ClassroomView>(await fetchImpl(classroomEndpoint, { method: 'GET', credentials: 'same-origin', signal })),
    command: (input, signal) => post<ClassroomView>(input, signal),
    listLectures: (spaceId, signal) => post<LectureListView>({ action: 'lecture-list', spaceId }, signal),
    readLecture: (spaceId, path, signal) => post<LectureReadView>({ action: 'lecture-read', spaceId, path }, signal),
    readTopic: (spaceId, signal) => post<TopicView>({ action: 'topic-read', spaceId }, signal),
    saveTopicGoal: (input, signal) => post<TopicView>(input, signal),
    readSummary: (spaceId, signal) => post<SummaryView>({ action: 'summary-read', spaceId }, signal),
    saveSummary: (input, signal) => post<SummaryView>(input, signal),
    saveReadingPosition: (input, signal) => post<ClassroomSpaceView>(input, signal),
    selectNote: (input, signal) => post<ClassroomSpaceView>(input, signal),
    listLectureCandidates: (spaceId, signal) => post<LectureCandidatesView>({ action: 'lecture-candidates', spaceId }, signal),
    linkLecture: (spaceId, path, signal) => post<LectureListView>({ action: 'lecture-link', spaceId, path }, signal),
    unlinkLecture: (spaceId, path, signal) => post<LectureListView>({ action: 'lecture-unlink', spaceId, path }, signal),
    listNotes: (spaceId, signal) => post<NoteListView>({ action: 'note-list', spaceId }, signal),
    readNote: (spaceId, path, signal) => post<NoteDocumentView>({ action: 'note-read', spaceId, path }, signal),
    saveNote: (input, signal) => post<NoteSaveView>(input, signal),
    readCanvas: (spaceId, signal) => post<CanvasReadView>({ action: 'canvas-read', spaceId }, signal),
    saveLayout: (input, signal) => post<ClassroomView>(input, signal),
    resolveLink: (input, signal) => post<LinkResolveView>(input, signal),
  }
}
