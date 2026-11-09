import type { ClassroomCommand, ClassroomView } from './contract.ts'

export const classroomEndpoint = '/api/learning-classroom'

export interface ClassroomClient {
  load(signal?: AbortSignal): Promise<ClassroomView>
  command(input: ClassroomCommand, signal?: AbortSignal): Promise<ClassroomView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function payload(response: Response): Promise<ClassroomView> {
  const body = await response.json().catch(() => undefined) as { error?: string } | undefined
  if (!response.ok) {
    throw new Error(body?.error ?? `学习课堂请求失败（HTTP ${response.status}）`)
  }
  return body as unknown as ClassroomView
}

/** Browser boundary for the single classroom HTTP entry. */
export function createClassroomClient(fetchImpl: FetchLike = (input, init) => fetch(input, init)): ClassroomClient {
  return {
    load: async signal => payload(await fetchImpl(classroomEndpoint, { method: 'GET', credentials: 'same-origin', signal })),
    command: async (input, signal) => payload(await fetchImpl(classroomEndpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })),
  }
}
