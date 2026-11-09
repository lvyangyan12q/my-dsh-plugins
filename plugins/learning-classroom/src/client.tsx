export { apply, ClassroomPanel, panelId, panelLabel, inject } from './classroom-panel.tsx'
export type { ClassroomPanelProps } from './classroom-panel.tsx'
export { TeacherSessionZone, TeacherConversationSeat, teacherSessionSeat, teacherSessionSource } from './session-zone.tsx'
export type {
  SessionProviderLike,
  SessionReferenceLike,
  SessionsLike,
  TeacherConversationSeatProps,
  TeacherSessionZoneProps,
} from './session-zone.tsx'
export { LectureZone } from './lecture-zone.tsx'
export type { LectureZoneProps } from './lecture-zone.tsx'
export { NotesZone } from './notes-zone.tsx'
export type { NotesZoneProps, NoteSaveStatus } from './notes-zone.tsx'
export { createClassroomClient, classroomEndpoint, ClassroomClientError, classroomErrorCode } from './classroom-client.ts'
export type { ClassroomClient } from './classroom-client.ts'
export type {
  ClassroomCommand,
  ClassroomLectureKind,
  ClassroomLectureView,
  ClassroomSpaceView,
  ClassroomView,
  ClassroomVaultView,
  LectureListView,
  LectureReadView,
  NoteCommand,
  NoteDocumentView,
  NoteListView,
  NoteSaveCommand,
  NoteSaveView,
  NoteSummaryView,
} from './contract.ts'
