/** Platform-owned capabilities, distinct from the reusable management catalog. */
export const workbenchBuilderPreset = 'personal-workbench.module-builder.v1'
export const workbenchSkillProvider = 'workbench-packaged'
export const workbenchSkillNames = ['workbench-module-generate', 'workbench-page-adjust', 'workbench-data-display', 'workbench-app-build'] as const
export type WorkbenchSkillName = typeof workbenchSkillNames[number]
