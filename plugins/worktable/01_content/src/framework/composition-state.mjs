import {CompositionError,compositionDefinition} from './composition-schema.mjs'
const fail=(code,message,status=409)=>{throw new CompositionError(code,message,status)}
export function presentationContext(data,viewId){
 const view=data.views.find(row=>row.id===viewId),instance=data.instances.find(row=>row.id===view?.instanceId),composition=data.compositions?.find(row=>row.appId===instance?.appId&&row.running)
 if(!view||!instance||!composition)fail('composition-view-required','请从已登记的组合应用视图访问状态。',403)
 if(!compositionDefinition(composition).views.some(row=>row.id===view.type))fail('view-unavailable','此页面已移除，原视图记录保留。')
 return {view,instance,composition}
}
export function presentationScope(recipe,scopeId){return recipe.pages.some(page=>page.modules.some(module=>(module.connectionId??module.id)===scopeId))}
export function cleanPresentation(input){
 const {filters,selectedId}=input
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length>32||Object.entries(filters).some(([key,value])=>!/^\w[\w.-]{0,63}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||typeof value!=='string'||value.length>500)||selectedId!==null&&(typeof selectedId!=='string'||selectedId.length>1024))fail('invalid-state','筛选或选中记录无效。',400)
 return {filters:structuredClone(filters),selectedId}
}
export function validatePresentationStates(rows,data){
 if(!Array.isArray(rows))throw Error('presentation states');const ids=new Set()
 for(const row of rows){if(ids.has(row.instanceId)||!data.instances.some(instance=>instance.id===row.instanceId)||!Number.isSafeInteger(row.revision)||row.revision<1||!row.scopes||typeof row.scopes!=='object'||Array.isArray(row.scopes)||Object.keys(row.scopes).length>768)throw Error('presentation identity');ids.add(row.instanceId);for(const [key,value] of Object.entries(row.scopes)){if(!/^[a-z][a-z0-9.-]{0,63}$/.test(key))throw Error('presentation scope');cleanPresentation(value)}}
}
