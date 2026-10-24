import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { RoleDefinition, PrivateCapability } from 'dsh-worktable/sdk'
import { TAXONOMY } from './taxonomy.ts'

export const legacyTeacherPresetId = 'personal-workbench.kaogong-teacher.v1'
export const teachingSkillProvider = 'kaogong-packaged-teaching'
export const roleSubjects = TAXONOMY.map(row => row.subject)
export const subjectRoleIds = ['language', 'quantitative', 'reasoning', 'data-analysis', 'general-knowledge', 'essay'].map(id => `teacher.${id}`)
const subjectPresetIds = subjectRoleIds.map(id => `kaogong.${id}.v1`)

/** Application-owned personas and trusted installation Skill root; never loads roles/cordis.yml. */
export async function kaogongRolePresets() {
  const rows: { id: string; roleId: string; name: string; file: string; subject?: string }[] = [
    { id: legacyTeacherPresetId, roleId: 'teacher', name: '默认老师（旧课堂）', file: '老师' },
    { id: 'kaogong.class-advisor.v1', roleId: 'class-advisor', name: '班主任', file: '班主任' },
    { id: 'kaogong.counselor.v1', roleId: 'counselor', name: '辅导员', file: '辅导员' },
    ...roleSubjects.map((subject, index) => ({ id: subjectPresetIds[index]!, roleId: subjectRoleIds[index]!, name: subject, file: '老师', subject })),
  ]
  return Promise.all(rows.map(async row => ({ id: row.id, name: row.name, description: '考公持续课堂角色', plugins: [
    { name: '@deepseek-ai/dsh-persona', config: { prefix: (await readFile(new URL(`../roles/personas/${row.file}.md`, import.meta.url), 'utf8')).replaceAll('{科目}', row.subject ?? '已确认科目'), complete: false, includeRuntimeContext: true } },
    { name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: teachingSkillProvider, includeDefaultRoots: false, customSkillDirs: [], bundledSkillDir: fileURLToPath(new URL('../roles/skills/', import.meta.url)), watch: false } },
    { name: '@deepseek-ai/dsh-tool-skill', config: {} },
    { name: '@deepseek-ai/dsh-tool-ask-user', config: {} },
  ] })))
}

/** Explicit deployment location is captured by each durable intent, not inferred from process cwd. */
export function kaogongPrivateCapabilities(): PrivateCapability[] {
  const rows = [{id:'teacher',title:'默认老师',presetId:legacyTeacherPresetId},
    {id:'class-advisor',title:'班主任',presetId:'kaogong.class-advisor.v1'},
    {id:'counselor',title:'辅导员',presetId:'kaogong.counselor.v1'},
    ...roleSubjects.map((title,index)=>({id:subjectRoleIds[index]!,title,presetId:subjectPresetIds[index]!}))]
  return [...rows.map(row=>({...row,kind:'agent' as const,enabled:true,userInvocable:true,modelInvocable:true})),
    {id:'kaogong-teach',title:'考公教学',kind:'skill',provider:teachingSkillProvider,enabled:true,userInvocable:true,modelInvocable:true}]
}
export function kaogongRoleDefinitions(cwd?: string): RoleDefinition[] {
  if (!cwd) return []
  return kaogongPrivateCapabilities().filter(row=>row.kind==='agent').map(row=>({
    id:row.id,title:row.title,creation:{cwd},agent:{kind:'agent',source:'application',ownerAppId:'kaogong',id:row.id},
    skills:[{kind:'skill',source:'application',ownerAppId:'kaogong',id:'kaogong-teach'}],
  }))
}

/** Registration owns declarations only; no native Session is created or silently adopted. */
export async function installKaogongRoles(ctx: Context, cwd?: string) {
  const removers: (() => void | Promise<void>)[] = []
  try {
    for (const preset of await kaogongRolePresets()) removers.push(await ctx.agentPresets.register(preset))
    removers.push(ctx.worktableCapabilities.contribute('kaogong',kaogongPrivateCapabilities()))
    removers.push(ctx.worktableRoles.contribute('kaogong',kaogongRoleDefinitions(cwd)))
  } catch (error) {
    await Promise.allSettled(removers.reverse().map(remove=>Promise.resolve().then(remove)))
    throw error
  }
  return async () => { for (const remove of removers.reverse()) await remove() }
}
