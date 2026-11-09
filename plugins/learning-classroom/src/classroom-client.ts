import type {
  ClassroomCommand,
  ClassroomView,
  LectureListView,
  LectureReadView,
  NoteCommand,
  NoteDocumentView,
  NoteListView,
  NoteSaveCommand,
  NoteSaveView,
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
  command(input: ClassroomCommand, signal?: AbortSignal): Promise<ClassroomView>
  listLectures(spaceId: string, signal?: AbortSignal): Promise<LectureListView>
  readLecture(spaceId: string, path: string, signal?: AbortSignal): Promise<LectureReadView>
  listNotes(spaceId: string, signal?: AbortSignal): Promise<NoteListView>
  readNote(spaceId: string, path: string, signal?: AbortSignal): Promise<NoteDocumentView>
  saveNote(input: NoteSaveCommand, signal?: AbortSignal): Promise<NoteSaveView>
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
    listNotes: (spaceId, signal) => post<NoteListView>({ action: 'note-list', spaceId }, signal),
    readNote: (spaceId, path, signal) => post<NoteDocumentView>({ action: 'note-read', spaceId, path }, signal),
    saveNote: (input, signal) => post<NoteSaveView>(input, signal),
  }
}
