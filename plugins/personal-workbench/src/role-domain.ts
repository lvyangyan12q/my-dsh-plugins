import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { isAbsolute } from 'node:path'
import type { RoleBinding } from './role-binding-api.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Strict durable parser; malformed records fail explicitly instead of replacing a Session. */
export const roleBindingRecord = z.object({ version: z.literal(1),
  key: z.object({ appId: z.string().min(1), instanceId: z.string().min(1), roleId: z.string().min(1), subject: z.string().min(1).optional() }).strict(),
  sessionId: z.string().min(1).transform(value => value as SessionId), presetId: z.string().min(1), phase: z.enum(['intent', 'ready']), previousSessionIds: z.array(z.string().min(1).transform(value => value as SessionId)),
  creation: z.object({ cwd: z.string().min(1).refine(isAbsolute, 'Creation cwd must be absolute') }).strict().optional(),
  selectedPreset: z.boolean().optional(),
}).strict()
/** Workbench owns this single new domain; no Kaogong domain is opened here. */
export const roleBindingsDomain = defineDomain({ name: 'personal_workbench_role_bindings', version: 1,
  tables: { bindings: domainTable<string, RoleBinding>(roleBindingRecord) } })
