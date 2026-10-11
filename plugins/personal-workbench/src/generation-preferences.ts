import type { GenerationJob } from './generation-api.ts'
const key = 'personal-workbench/generation-editor/v1'
interface GenerationPreference { requirement: string; workspace?: string; job: GenerationJob | null; deliveredJobId?: string }
const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
/** Browser state retains only recoverable identity, never generated records or execution authority. */
export function loadGenerationPreference(): GenerationPreference | undefined {
 try {
  const raw = window.localStorage.getItem(key); if (!raw || raw.length > 32768) return
  const row: unknown = JSON.parse(raw)
  if (!object(row) || row.version !== 1 || Object.keys(row).some(name => !['version','requirement','workspace','job','deliveredJobId'].includes(name)) || !text(row.requirement,16000) || (row.workspace !== undefined && !text(row.workspace,2000))) return
  const job = row.job
  if (job !== null && (!object(job) || Object.keys(job).some(name => !['id','appId','status','sessionId','error'].includes(name)) || !text(job.id,36) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.id) || !text(job.appId,200) || !job.appId || !['running','saving','completed','failed','cancelled'].includes(String(job.status)) || (job.sessionId !== undefined && (!text(job.sessionId,2000) || !job.sessionId)) || (job.error !== undefined && !text(job.error,2000)))) return
  if(row.deliveredJobId!==undefined&&(!object(job)||row.deliveredJobId!==job.id))return
  return { ...(row.deliveredJobId===undefined?{}:{deliveredJobId:row.deliveredJobId as string}), requirement: row.requirement, ...(row.workspace === undefined ? {} : { workspace: row.workspace }), job: job as GenerationJob | null }
 } catch { return }
}
export function saveGenerationPreference(row: GenerationPreference): void {
 try {
  const { job } = row
  const value = JSON.stringify({ version: 1, ...(row.deliveredJobId&&row.deliveredJobId===job?.id?{deliveredJobId:row.deliveredJobId}:{}), requirement: row.requirement, ...(row.workspace ? { workspace: row.workspace } : {}), job: job ? { id: job.id, appId: job.appId, status: job.status, ...(job.sessionId ? { sessionId: job.sessionId } : {}), ...(job.error ? { error: job.error } : {}) } : null })
  if (value.length <= 32768) window.localStorage.setItem(key,value)
  else window.localStorage.removeItem(key)
 } catch { /* Restricted browser storage leaves current editing usable. */ }
}
