import type * as WorkbenchClient from '@deepseek-ai/dsh-personal-workbench/client'

declare const require: (spec: string) => typeof WorkbenchClient

/** The native bundle require is optional only when its package factory is absent. */
function loadWorkbenchClient(): typeof WorkbenchClient | undefined {
  // Direct source consumers have no native bundle module table.
  if (typeof require !== 'function') return
  try { return require('@deepseek-ai/dsh-personal-workbench/client') }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('client-modules: require("@deepseek-ai/dsh-personal-workbench/client") missed the module table')) return
    throw error
  }
}
export const optionalWorkbenchClient = loadWorkbenchClient()
