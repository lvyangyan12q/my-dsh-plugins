import {reject} from './roles.mjs'
export const WORKSPACE_BASE='workspace-basic-v1'
export const WORKSPACE_BASE_MODULES=Object.freeze(['@deepseek-ai/dsh-tool-fs','@deepseek-ai/dsh-tool-fs-search','@deepseek-ai/dsh-tool-ask-user','@deepseek-ai/dsh-tool-skill','@deepseek-ai/dsh-persona'])
/** Explicit versioned capability set, not a clone or implied inheritance of the user's standard preset. */
export function managedAgentDefinition(row){
 const plugins=[{name:'@deepseek-ai/dsh-tool-skill'},{name:'@deepseek-ai/dsh-persona',config:{prefix:row.content,suffix:row.skillIds.length?'Use assigned Skills when relevant: '+row.skillIds.join(', '):''}}]
 if(row.baseComposition===WORKSPACE_BASE)plugins.unshift(...WORKSPACE_BASE_MODULES.slice(0,3).map(name=>({name})))
 else if(row.baseComposition!==undefined)reject('base-unsupported','Agent基础能力版本不受支持。')
 return {id:row.presetId,name:row.title,description:row.description,plugins}
}
/** Official rc.2 compositionInventory reports public enabled/fiberState facts (FiberState.ACTIVE = 2). */
export async function assertManagedComposition(registry,row){
 if(row.baseComposition!==WORKSPACE_BASE)reject('base-required','请在Agent管理中显式选择基础能力并保存；原有指令与会话保留。')
 if(typeof registry.compositionInventory!=='function')reject('composition-unavailable','当前宿主缺少rc.2公开能力组合检查接口。')
 const inventory=(await registry.compositionInventory()).find(preset=>preset.id===row.presetId)
 if(!inventory||inventory.broken||WORKSPACE_BASE_MODULES.some(name=>!inventory.rows.some(plugin=>plugin.moduleName===name&&plugin.enabled===true&&plugin.fiberState===2)))reject('composition-unavailable','原生基础能力未完整激活：需要文件读写、检索、提问与Skill工具。')
}
