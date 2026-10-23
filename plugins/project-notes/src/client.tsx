import type {Context} from '@deepseek-ai/cordis'
import {requireProtocol} from 'dsh-worktable/sdk'
import {registerNotesSettings} from './notes-settings.tsx'
import {createNotesViews} from './notes-views.tsx'
export const inject:string[]=[]
export function apply(ctx:Context){
 ctx.inject(['worktableApplicationViews'],child=>child.effect(()=>{
  requireProtocol(child.worktableApplicationViews.describe?.(),['instance-view-v1','prepared-task-v1','presentation-components-v1']);const owner=createNotesViews();let remove:(()=>void|Promise<void>)|undefined
  try{remove=child.worktableApplicationViews.register('project-notes',owner.views)}catch(error){owner.dispose();throw error}
  return async()=>{try{await remove?.()}finally{owner.dispose()}}
 },'project notes views'))
 registerNotesSettings(ctx)
}
