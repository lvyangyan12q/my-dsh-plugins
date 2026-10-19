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
 const rows=Array.isArray(inventory?.rows)?inventory.rows:[]
 if(!inventory||inventory.broken||WORKSPACE_BASE_MODULES.some(name=>!rows.some(plugin=>plugin.moduleName===name&&plugin.enabled===true&&plugin.fiberState===2))){
  // Bounded public facts only: never serialize the declaration, persona, plugin config or profile.
  const facts=WORKSPACE_BASE_MODULES.map(name=>{
   const plugin=rows.find(plugin=>plugin.moduleName===name),label=name.replace('@deepseek-ai/','')
   if(!plugin)return label+': missing'
   const enabled=[true,false,'conditional'].includes(plugin.enabled)?String(plugin.enabled):'unknown'
   return label+': enabled='+enabled+', state='+(Number.isInteger(plugin.fiberState)?plugin.fiberState:'none')
  }).join('; ')
  const broken=typeof inventory?.broken==='string'?inventory.broken.replace(/[\r\n\t]+/g,' ').replace(/\b(api[_ -]?key|authorization|password|token|secret)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,'$1=<REDACTED>').slice(0,360):''
  const observed=rows.slice(0,5).map(plugin=>String(plugin.moduleName??'unknown').slice(0,160)+': enabled='+([true,false,'conditional'].includes(plugin.enabled)?String(plugin.enabled):'unknown')+', state='+(Number.isInteger(plugin.fiberState)?plugin.fiberState:'none')).join('; ')
  reject('composition-unavailable',('原生基础能力未完整激活：需要文件读写、检索、提问与Skill工具。 ['+facts+']'+(broken?' 原生诊断：'+broken:'')+(observed?' observed: '+observed:'')).slice(0,1500))
 }
}
