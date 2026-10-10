import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { SkillAssignment } from './management-api.ts'

export const managementKey = z.object({ appId: z.string().min(1).max(200), instanceId: z.string().min(1).max(200),
  roleId: z.string().min(1).max(200), subject: z.string().min(1).max(200).optional() }).strict()
export const skillName = z.string().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const assignedNames = z.array(skillName).max(32).refine(names => new Set(names).size === names.length, 'Duplicate Skill name')
export const assignmentRecord = z.object({ version: z.literal(1), key: managementKey,
  revision: z.number().int().nonnegative(), names: assignedNames }).strict()
export const managementRequest = z.discriminatedUnion('action', [z.object({ action: z.literal('catalog') }).strict(),
  z.object({ action: z.literal('assign'), key: managementKey, expectedRevision: z.number().int().nonnegative(), names: assignedNames }).strict()])
export const managementDomain = defineDomain({ name: 'personal_workbench_management', version: 1,
  tables: { assignments: domainTable<string, SkillAssignment>(assignmentRecord) } })
