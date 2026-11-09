/** Wire contract shared by the Host service and the browser panel. */
export interface ClassroomSpaceView {
  id: string
  title: string
  directory: string
  notePath: string
  createdAt: string
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

export type ClassroomCommand =
  | { action: 'vault-choose'; path: string }
  | { action: 'space-create'; title: string }
  | { action: 'space-open'; spaceId: string }
