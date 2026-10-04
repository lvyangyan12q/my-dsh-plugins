import { z } from 'zod'
import type { AppRecipe } from './recipe-api.ts'
const id=z.string().min(1).max(200), revision=z.number().int().nonnegative()
const moduleSchema=z.object({id,type:id,title:z.string().max(500),connectionId:id.optional(),roleId:id.optional(),config:z.record(z.string(),z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()]))}).strict()
export const recipeSchema=z.object({schemaVersion:z.literal(1),workspace:z.string().min(1).max(2000).optional(),appId:id,version:z.number().int().positive(),name:z.string().min(1).max(200),description:z.string().max(2000),pages:z.array(z.object({id,label:z.string().min(1).max(200),layout:z.enum(['stack','grid','split']),splitPercent:z.number().int().min(20).max(80).optional(),modules:z.array(moduleSchema).max(100)}).strict()).min(1).max(30),connections:z.array(z.object({id,sourceAppId:id,resource:id}).strict()).max(100),roles:z.array(z.object({id,name:id,presetId:id,skillNames:z.array(id).max(100)}).strict()).max(30)}).strict()
export const recipeRecordSchema=z.object({appId:id,revision,draft:recipeSchema,running:recipeSchema.optional()}).strict()
export const recipeRequestSchema=z.discriminatedUnion('action',[z.object({action:z.literal('catalog')}).strict(),z.object({action:z.literal('workspaces')}).strict(),z.object({action:z.literal('save'),expectedRevision:revision,recipe:recipeSchema}).strict(),z.object({action:z.enum(['preview','activate']),appId:id,expectedRevision:revision}).strict()])
export function structuralErrors(recipe:AppRecipe):string[]{
 const errors:string[]=[]
 const unique=(ids:string[],label:string)=>{if(new Set(ids).size!==ids.length)errors.push(`Duplicate ${label} identity`)}
 unique(recipe.pages.map(p=>p.id),'page');unique(recipe.pages.flatMap(p=>p.modules.map(m=>m.id)),'module');unique(recipe.roles.map(r=>r.id),'role');unique(recipe.connections.map(c=>c.id),'connection')
 for(const page of recipe.pages)for(const module of page.modules){if(module.type==='role-chat'&&!module.roleId)errors.push(`Missing role for conversation module: ${module.id}`);if(module.connectionId&&!recipe.connections.some(c=>c.id===module.connectionId))errors.push(`Missing connection: ${module.connectionId}`);if(module.roleId&&!recipe.roles.some(r=>r.id===module.roleId))errors.push(`Missing role: ${module.roleId}`)}
 return errors
}
