import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from 'dsh-worktable/sdk'
import {Config} from './business.ts'
import {mountKaogong} from './production-host.ts'
export {Config}
export const name='kaogong'
export const inject=['tools','storageDomain','webServer','connection','worktableApplications','worktableRoles','worktableResources','worktableCapabilities','worktableTaskOwners','agentPresets','worktableProtocol']
export function apply(ctx:Context,config:Config){ctx.effect(async function*(){const dispose=await mountKaogong(ctx,config);yield dispose},'Kaogong public Worktable Host')}
