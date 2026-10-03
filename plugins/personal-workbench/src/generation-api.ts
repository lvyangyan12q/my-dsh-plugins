import type {RecipeRecord} from './recipe-api.ts'
export interface GenerationJob { id:string; appId:string; status:'running'|'saving'|'completed'|'failed'|'cancelled'; sessionId?:string; record?:RecipeRecord; error?:string }
export type GenerationRequest = {action:'start'; requirement:string; appId:string; version:number; expectedRevision:number} | {action:'status'|'cancel'; id:string}

/** Loader access registers the trusted generator guard; never borrow root access. */
export const generationHostDependencies=['personalWorkbenchRecipes','sessionController','agentPresets','tools','connection','loader','systemPrompt']
