import type { PreparedTask } from './task-api.ts'
import { workbenchSkillNames } from './workbench-skill-api.ts'

export const preparedTaskStorageKey = 'personal-workbench/prepared-tasks/v1'
export type TaskStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export interface SavedTask { prepared: PreparedTask; recoveryRequired: boolean }
const MAX_BYTES = 1048576
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, limit = 32000): value is string => typeof value === 'string' && value.length <= limit
const identity = (value: unknown): value is string => text(value, 512) && !!value

/** Untrusted local presentation state cannot restore code-owned callbacks or native execution. */
function validTask(value: unknown): value is PreparedTask {
 if (!object(value) || Object.keys(value).some(key => !['key','task','source','context','teaching','skill','generationRequestId'].includes(key))) return false
 if (!object(value.key) || Object.keys(value.key).some(key => !['appId','instanceId','roleId','subject'].includes(key)) || !identity(value.key.appId) || !identity(value.key.instanceId) || !identity(value.key.roleId) || (value.key.subject !== undefined && !identity(value.key.subject))) return false
 if (!text(value.task) || !object(value.source) || Object.keys(value.source).some(key => !['pageId','moduleId','label'].includes(key)) || !identity(value.source.pageId) || !identity(value.source.moduleId) || !text(value.source.label,2048)) return false
 if (!Array.isArray(value.context) || value.context.length > 100 || value.context.some(c => !object(c) || Object.keys(c).some(key => !['id','label','source','text'].includes(key)) || !identity(c.id) || !text(c.label,2048) || !text(c.source,2048) || !text(c.text)) || new Set(value.context.map(c => c.id)).size !== value.context.length) return false
 if (value.teaching !== undefined && typeof value.teaching !== 'boolean') return false
 if (value.skill !== undefined && !workbenchSkillNames.includes(value.skill as typeof workbenchSkillNames[number])) return false
 return value.generationRequestId === undefined || (typeof value.generationRequestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.generationRequestId))
}
export function browserTaskStorage(): TaskStorage | undefined { try { return window.localStorage } catch { return undefined } }
export function loadPreparedTasks(storage?: TaskStorage): SavedTask[] {
 try {
  const raw = storage?.getItem(preparedTaskStorageKey)
  if (!raw || raw.length > MAX_BYTES) return []
  const parsed: unknown = JSON.parse(raw)
  if (!object(parsed) || parsed.version !== 1 || Object.keys(parsed).some(key => !['version','tasks'].includes(key)) || !Array.isArray(parsed.tasks) || parsed.tasks.length > 32) return []
  const result: SavedTask[] = [], keys = new Set<string>()
  for (const row of parsed.tasks) {
   if (!object(row) || Object.keys(row).some(key => !['prepared','recoveryRequired'].includes(key)) || !validTask(row.prepared) || typeof row.recoveryRequired !== 'boolean') return []
   const key = JSON.stringify([row.prepared.key.appId,row.prepared.key.instanceId,row.prepared.key.roleId,row.prepared.key.subject ?? null])
   if (keys.has(key)) return []; keys.add(key)
   result.push({ prepared: row.prepared, recoveryRequired: row.recoveryRequired || !!row.prepared.generationRequestId })
  }
  return result
 } catch { return [] }
}
export function savePreparedTasks(storage: TaskStorage | undefined, tasks: SavedTask[]): void {
 if (!storage) return
 try {
  const value = JSON.stringify({ version: 1, tasks })
  if (!tasks.length || tasks.length > 32 || value.length > MAX_BYTES) storage.removeItem(preparedTaskStorageKey)
  else storage.setItem(preparedTaskStorageKey,value)
 } catch { /* Restricted browser storage leaves current in-memory editing available. */ }
}
