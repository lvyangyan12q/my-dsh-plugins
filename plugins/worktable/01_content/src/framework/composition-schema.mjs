import {isAbsolute} from 'node:path'
export class CompositionError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status}}
const fail=(message)=>{throw new CompositionError('invalid-recipe',message)}
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(value)
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4096
export const MODULE_TYPES=Object.freeze(['website','custom','conversation','animation','resources','statistics','list','detail','filter'])
export function normalizeRecipe(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!text(input.title)||typeof input.version!=='string'||!/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(input.version)||!['vertical','grid','split'].includes(input.layout)||!Array.isArray(input.pages)||!input.pages.length||input.pages.length>24)fail('请填写名称、数字版本、布局和页面。')
 const recipe=structuredClone(input),pages=new Set(),modules=new Set();
 for(const page of recipe.pages){if(!page||!id(page.id)||pages.has(page.id)||!text(page.title)||!Array.isArray(page.modules)||page.modules.length>32)fail('页面标识、名称或模块无效。');pages.add(page.id)
 for(const module of page.modules){if(!module||!id(module.id)||modules.has(module.id)||!MODULE_TYPES.includes(module.type)||module.config!==undefined&&(!module.config||typeof module.config!=='object'||Array.isArray(module.config)))fail('模块标识必须唯一，且类型与配置有效。');modules.add(module.id)}}
 for(const name of ['connections','roles']){recipe[name]??=[];if(!Array.isArray(recipe[name])||recipe[name].length>32)fail('数据或角色引用无效。')}
 const connections=new Set();for(const ref of recipe.connections){if(!ref||!id(ref.id)||connections.has(ref.id)||!text(ref.viewId)||!id(ref.resourceId)||Object.keys(ref).some(key=>!['id','viewId','resourceId'].includes(key)))fail('数据连接必须明确来源视图和只读资源。');connections.add(ref.id)}
 const roles=new Set();for(const role of recipe.roles){if(!role||!id(role.id)||roles.has(role.id)||!text(role.title)||!role.agent||!['managed','application'].includes(role.agent.source)||!id(role.agent.id)||role.agent.kind!=='agent'||!role.creation||typeof role.creation.cwd!=='string'||!isAbsolute(role.creation.cwd))fail('角色必须明确Agent来源。');roles.add(role.id)}
 for(const page of recipe.pages)for(const module of page.modules){if(module.connectionId!==undefined&&!connections.has(module.connectionId)||module.roleId!==undefined&&!roles.has(module.roleId))fail('模块引用了不存在的数据或角色。')}
 if(JSON.stringify(recipe).length>196608)fail('组合应用配置过大。');return recipe
}
export function compositionDefinition(row){const recipe=row.running;return {id:row.appId,title:recipe.title,version:recipe.version,kind:'deep',protocolVersion:1,composition:true,views:recipe.pages.map((page,index)=>({id:index===0?'page':'page.'+page.id,title:page.title}))}}
export function validateCompositions(rows){if(!Array.isArray(rows))throw Error('compositions');const ids=new Set();for(const row of rows){if(!id(row.appId)||ids.has(row.appId)||!Number.isSafeInteger(row.revision)||row.revision<1||row.owner!=='worktable-compositions')throw Error('composition identity');ids.add(row.appId);normalizeRecipe(row.draft);if(row.running)normalizeRecipe(row.running)}}
