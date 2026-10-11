import type {WorkbenchInstanceId} from './workbench-api.ts'

/** Host and Client share the same stable identity length without a browser schema dependency. */
export const workbenchInstanceMaxLength=200
export function isWorkbenchInstanceId(value:unknown):value is WorkbenchInstanceId {
  return typeof value==='string'&&value.length>=1&&value.length<=workbenchInstanceMaxLength
}
