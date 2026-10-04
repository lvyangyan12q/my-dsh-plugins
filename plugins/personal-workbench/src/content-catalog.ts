import type {RecipeModule} from './recipe-api.ts'
export const contentTypes=['empty','chart','map','stats','list','detail','filter','website','custom','role-chat','animation','resources'] as const
export function webAddress(value:unknown):string|undefined {
 if(typeof value!=='string'||!value.trim())return undefined
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return undefined;return url.href}catch{return undefined}
}
export function relativeContentPath(value:unknown):boolean {
 return typeof value==='string'&&value.length<=2000&&!/[\\:\0]/.test(value)&&!value.startsWith('/')&&!value.split('/').includes('..')
}
export function contentErrors(module:RecipeModule):string[]{
 const errors:string[]=[],c=module.config
 if(module.type==='chart'&&(typeof c.valueField!=='string'||!c.valueField.trim()))errors.push('Choose a numeric field: '+module.id)
 if(module.type==='map'&&(!String(c.latitudeField??'').trim()||!String(c.longitudeField??'').trim()))errors.push('Choose latitude and longitude fields: '+module.id)
 if(['website','animation'].includes(module.type)&&!webAddress(c.url))errors.push('An HTTP(S) address is required: '+module.id)
 if(module.type==='resources'&&!relativeContentPath(c.basePath??''))errors.push('A workspace-relative directory is required: '+module.id)
 if(module.type==='custom'){
  if(!['url','file','generate'].includes(String(c.mode)))errors.push('Choose a custom content source: '+module.id)
  if(c.mode==='url'&&!webAddress(c.url))errors.push('An HTTP(S) address is required: '+module.id)
  if(c.mode==='file'&&(!relativeContentPath(c.path)||!String(c.path).trim()||!String(c.path).toLowerCase().endsWith('.html')))errors.push('A workspace-relative HTML file is required: '+module.id)
  if(c.mode==='generate'&&!module.roleId)errors.push('A role is required for generated content: '+module.id)
 }
 return errors
}
