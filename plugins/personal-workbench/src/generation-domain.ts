import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { recipeRecordSchema } from './recipe-schema.ts'
const summary = z.object({ id: z.string().uuid(), appId: z.string().min(1).max(200), status: z.enum(['running','saving','completed','failed','cancelled']), sessionId: z.string().min(1).max(2000).optional(), record: recipeRecordSchema.optional(), error: z.string().max(2000).optional() }).strict()
/** Only job identity/outcome is durable. Native model work is never resumed from storage. */
export const generationJobsDomain = defineDomain({ name: 'personal_workbench_generation_jobs', version: 1, tables: { jobs: domainTable<string,z.infer<typeof summary>>(summary) } })
