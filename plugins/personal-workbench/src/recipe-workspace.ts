import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import {resolve,isAbsolute} from 'node:path'

export const sameWorkspace=(left:string,right:string)=>process.platform==='win32'?resolve(left).toLowerCase()===resolve(right).toLowerCase():resolve(left)===resolve(right)
export async function recipeWorkspaces(ctx:Context):Promise<string[]>{
 const paths:string[]=[]
 for(const workspace of ctx.workspaceRegistry?.list()??[]){if(await workspace.status()==='ok')paths.push(workspace.path)}
 return paths
}
export async function selectRecipeWorkspace(ctx:Context,selected?:string):Promise<string>{
 if(selected&&!isAbsolute(selected))throw new Error('An absolute trusted Host workspace is required')
 const paths=await recipeWorkspaces(ctx),path=selected?paths.find(path=>sameWorkspace(path,selected)):paths[0]
 if(!path)throw new Error('Trusted Host workspace unavailable')
 return path
}
export function checkInstanceWorkspace(selected:string|undefined,pinned:string){
 if(selected&&!sameWorkspace(selected,pinned))throw new Error('Application workspace changed; use a new instance or restore the original workspace')
}
