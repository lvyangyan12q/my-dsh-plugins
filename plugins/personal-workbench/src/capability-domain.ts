import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { managementKey, assignedNames, skillName } from './management-domain.ts'
import type { AgentInput, SkillInput, CapabilityExecution } from './management-api.ts'
export const agentInput = z.object({ id: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9.-]*$/), name: z.string().min(1).max(200), description: z.string().max(4000), persona: z.string().min(1).max(32000), skillNames: assignedNames, modelInvocable: z.boolean(), userInvocable: z.boolean() }).strict()
export const skillInput = z.object({ name: skillName, description: z.string().min(1).max(4000), content: z.string().min(1).max(64000), modelInvocable: z.boolean(), userInvocable: z.boolean() }).strict()
export interface AgentRecord extends AgentInput { revision: number }
export interface SkillRecord extends SkillInput { revision: number }
export const capabilityRequest = z.discriminatedUnion('action', [
 z.object({action:z.literal('agent-save'),agent:agentInput,expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('agent-remove'),id:z.string().min(1),expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('agent-open'),id:z.string().min(1),cwd:z.string().min(1).optional()}).strict(),
 z.object({action:z.literal('agent-bind'),key:managementKey,agentId:z.string().min(1),expectedSessionId:z.string().min(1).nullable()}).strict(),
 z.object({action:z.literal('skill-save'),skill:skillInput,expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('skill-remove'),name:skillName,expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('skill-read'),name:skillName}).strict(),
 z.object({action:z.literal('executions'),sessionId:z.string().min(1).optional()}).strict(),
])
export const capabilityDomain = defineDomain({name:'my_dsh_capabilities',version:1,tables:{
 agents:domainTable<string,AgentRecord>(agentInput.extend({revision:z.number().int().positive()})),
 skills:domainTable<string,SkillRecord>(skillInput.extend({revision:z.number().int().positive()})),
 executions:domainTable<string,CapabilityExecution>(z.object({id:z.string(),kind:z.enum(['agent','skill']),capabilityId:z.string(),sessionId:z.string(),childSessionId:z.string().optional(),startedAt:z.string(),finishedAt:z.string().optional(),status:z.enum(['running','completed','failed','cancelled']),error:z.string().optional()}).strict())
}})
