import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { RoleDefinition } from '@deepseek-ai/dsh-personal-workbench'
import { TAXONOMY } from './taxonomy.ts'

export const legacyTeacherPresetId = 'personal-workbench.kaogong-teacher.v1'
export const teachingSkillProvider = 'kaogong-packaged-teaching'
export const roleSubjects = TAXONOMY.map(row => row.subject)
const subjectPresetIds = ['language', 'quantitative', 'reasoning', 'data-analysis', 'general-knowledge', 'essay'].map(id => `kaogong.teacher.${id}.v1`)

/** Application-owned personas and trusted installation Skill root; never loads roles/cordis.yml. */
export async function kaogongRolePresets() {
  const rows: { id: string; roleId: string; name: string; file: string; subject?: string }[] = [
    { id: legacyTeacherPresetId, roleId: 'teacher', name: '默认老师（旧课堂）', file: '老师' },
    { id: 'kaogong.class-advisor.v1', roleId: 'class-advisor', name: '班主任', file: '班主任' },
    { id: 'kaogong.counselor.v1', roleId: 'counselor', name: '辅导员', file: '辅导员' },
    ...roleSubjects.map((subject, index) => ({ id: subjectPresetIds[index]!, roleId: 'teacher', name: subject, file: '老师', subject })),
  ]
  return Promise.all(rows.map(async row => ({ id: row.id, name: row.name, description: '考公持续课堂角色', plugins: [
    { name: '@deepseek-ai/dsh-persona', config: { prefix: (await readFile(new URL(`../roles/personas/${row.file}.md`, import.meta.url), 'utf8')).replaceAll('{科目}', row.subject ?? '已确认科目'), complete: false, includeRuntimeContext: true } },
    { name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: teachingSkillProvider, includeDefaultRoots: false, customSkillDirs: [], bundledSkillDir: fileURLToPath(new URL('../roles/skills/', import.meta.url)), watch: false } },
    { name: '@deepseek-ai/dsh-tool-skill', config: {} },
    { name: '@deepseek-ai/dsh-tool-ask-user', config: {} },
  ] })))
}

/** Explicit deployment location is captured by each durable intent, not inferred from process cwd. */
export function kaogongRoleDefinitions(cwd?: string): RoleDefinition[] {
  const definition = (roleId: string, presetId: string, subject?: string): RoleDefinition => ({
    key: { appId: 'kaogong', instanceId: 'default', roleId, ...(subject ? { subject } : {}) }, presetId,
    ...(cwd ? { creation: { cwd } } : {}), teaching: { skillName: 'kaogong-teach', provider: teachingSkillProvider },
  })
  return [definition('teacher', legacyTeacherPresetId), definition('class-advisor', 'kaogong.class-advisor.v1'), definition('counselor', 'kaogong.counselor.v1'),
    ...roleSubjects.map((subject, index) => definition('teacher', subjectPresetIds[index]!, subject))]
}

/** Optional registration only: no Session create, preset scope acquisition or model invocation. */
export async function installKaogongRoles(ctx: Context, cwd?: string) {
  const removePresets: (() => Promise<void>)[] = []
  const removeDefinitions: (() => void)[] = []
  try {
    for (const preset of await kaogongRolePresets()) removePresets.push(await ctx.agentPresets.register(preset))
    for (const definition of kaogongRoleDefinitions(cwd)) removeDefinitions.push(ctx.personalWorkbenchBindings.registerRole(definition))
  } catch (error) {
    for (const remove of removeDefinitions.reverse()) remove()
    for (const remove of removePresets.reverse()) await remove()
    throw error
  }
  return async () => { for (const remove of removeDefinitions.reverse()) remove(); for (const remove of removePresets.reverse()) await remove() }
}
