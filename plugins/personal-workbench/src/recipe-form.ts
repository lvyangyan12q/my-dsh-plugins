import type { AppRecipe } from './recipe-api.ts'
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const text=(value:unknown):value is string=>typeof value==='string'
const optionalText=(value:unknown)=>value===undefined||text(value)
const scalar=(value:unknown)=>value===null||text(value)||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)
/** Rendering guard only. Host recipeSchema remains the authoritative save/enable validator. */
export function isRecipeForm(value:unknown):value is AppRecipe {
 if(!object(value)||value.schemaVersion!==1||!text(value.appId)||!text(value.name)||!text(value.description)||typeof value.version!=='number'||!Number.isFinite(value.version))return false
 if(!Array.isArray(value.pages)||!Array.isArray(value.roles)||!Array.isArray(value.connections))return false
 const modules=(value:unknown)=>Array.isArray(value)&&value.every(m=>object(m)&&text(m.id)&&text(m.type)&&text(m.title)&&optionalText(m.roleId)&&optionalText(m.connectionId)&&object(m.config)&&Object.values(m.config).every(scalar))
 return value.pages.every(p=>object(p)&&text(p.id)&&text(p.label)&&['stack','grid','split'].includes(String(p.layout))&&modules(p.modules))
  &&value.roles.every(r=>object(r)&&text(r.id)&&text(r.name)&&text(r.presetId)&&Array.isArray(r.skillNames)&&r.skillNames.every(text))
  &&value.connections.every(c=>object(c)&&text(c.id)&&text(c.sourceAppId)&&text(c.resource))
}
