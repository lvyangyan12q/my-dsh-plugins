import type { WorkbenchAppDefinition } from './workbench-api.ts'
import type { WorkbenchSnapshot } from './workbench.ts'

/** One order for the home catalog and both sidebar entrances. Favorites stay first. */
export function compareApplications(preferences: WorkbenchSnapshot['apps']) {
  return (a: WorkbenchAppDefinition, b: WorkbenchAppDefinition): number =>
    Number(preferences[b.id]?.favorite ?? false) - Number(preferences[a.id]?.favorite ?? false)
    || (preferences[a.id]?.order ?? 0) - (preferences[b.id]?.order ?? 0) || a.name.localeCompare(b.name)
}
