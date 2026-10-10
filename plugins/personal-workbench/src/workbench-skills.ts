import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import * as filesystem from '@deepseek-ai/dsh-skill-filesystem'
import { fileURLToPath } from 'node:url'

import { workbenchBuilderPreset, workbenchSkillProvider } from './workbench-skill-api.ts'
export { workbenchBuilderPreset, workbenchSkillProvider, workbenchSkillNames } from './workbench-skill-api.ts'

/** Installation-owned rules; filesystem execution keeps the native Session policy. */
export async function installWorkbenchSkills(ctx: Context) {
  const provider = ctx.plugin(filesystem, {
    providerName: workbenchSkillProvider, includeDefaultRoots: false,
    customSkillDirs: [], bundledSkillDir: fileURLToPath(new URL('../skills/', import.meta.url)), watch: false,
  })
  let removePreset: (() => Promise<void>) | undefined
  try {
    await provider
    removePreset = await ctx.agentPresets.register({
      id: workbenchBuilderPreset, name: '工作台应用搭建', description: '工作台自有页面与模块生成角色',
      plugins: [
        { name: '@deepseek-ai/dsh-tool-fs', config: {} },
        { name: '@deepseek-ai/dsh-tool-skill', config: {} },
    { name: '@deepseek-ai/dsh-tool-ask-user', config: {} },
        { name: '@deepseek-ai/dsh-persona', config: { complete: false, includeRuntimeContext: true,
          prefix: '你负责工作台应用及模块。通过原生 skill 工具加载对应 workbench Skill。使用任务提供的精确应用、实例、页面、模块、请求身份和输出位置；保留业务资料、其他模块和原生会话历史。按原生权限执行文件操作；需要审批时等待用户处理。完成后提供输出位置和实际验证结果。' } },
      ],
    })
    let disposed = false
    return { async dispose() { if (disposed) return; disposed = true; try { await removePreset?.() } finally { await provider.dispose() } } }
  } catch (error) { try { await removePreset?.() } finally { await provider.dispose() }; throw error }
}
