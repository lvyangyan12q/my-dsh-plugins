import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-skill'
import {Config} from './business.ts'
import {mountKaogong} from './production-host.ts'
export {Config}
export const name='kaogong'
export const inject=['tools','storageDomain','webServer','connection','agentPresets','sessionController','sessionPersistence','workspaceRegistry','skills','agents']
export function apply(ctx:Context,config:Config){ctx.effect(async function*(){const dispose=await mountKaogong(ctx,config);yield dispose},'Kaogong independent study Host')}
