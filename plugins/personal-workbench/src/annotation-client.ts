import {validateAnnotationImage} from './annotation-image.ts'
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {RoleBindingKey} from './role-binding-api.ts'
import {roleKey} from './role-client.ts'
export interface PersonalWorkbenchAnnotations {append(key:RoleBindingKey,text:string,signal?:AbortSignal,reveal?:()=>Promise<void>,image?:File):Promise<SessionId>}
declare module '@deepseek-ai/cordis'{interface Context{personalWorkbenchAnnotations:PersonalWorkbenchAnnotations}}
/** Optional native input bridge. Never creates a Session, sends, or replaces a draft. */
export function installAnnotations(ctx:Context){ctx.inject(['personalWorkbenchRoles','conversation','sessions'],child=>{
 const service:PersonalWorkbenchAnnotations={append:async(key,text,signal,reveal,image)=>{
  signal?.throwIfAborted()
  if(!text.trim()||text.length>16000)throw Error('Invalid annotation')
  if(image)validateAnnotationImage(image)
  const roles=child.personalWorkbenchRoles;await roles.open(key)
  signal?.throwIfAborted()
  const current=roles.view?.getSnapshot().get(roleKey(key))
  if(current?.binding?.phase!=='ready'||current.window.phase!=='open')throw Error('Open or create the target role conversation first')
  await reveal?.();signal?.throwIfAborted()
  const latest=roles.view?.getSnapshot().get(roleKey(key));if(latest?.binding?.sessionId!==current.binding.sessionId||latest.window.phase!=='open')throw Error('Role conversation changed; retry annotation')
  const sessionId=current.binding.sessionId,scope=child.sessions.scope(sessionId)
  if(!scope)throw Error('Native role conversation unavailable')
  const input=child.conversation.input.for(scope),state=input.state.getSnapshot()
  if(!['plain','claimed'].includes(state.phase))throw Error('Native conversation draft is busy; retry later')
  let end=state.draft.length,previous=0
  for(const occurrence of state.occurrences){if(occurrence.offset<previous||occurrence.length<0||occurrence.offset+occurrence.length>state.draft.length)throw Error('Native draft references unavailable');previous=occurrence.offset+occurrence.length;end+=1-occurrence.length}
  if(image&&!child.conversation.stageImages)throw Error('Native screenshot draft API unavailable; update the DSH compatibility adapter')
  const rollback=image?child.conversation.stageImages!(sessionId,[image]):undefined
  try {
  const inserted=(state.draft.trim()?'\n\n':'')+text
  if(scope.bail(scope,'slash/input-insert-text',{text:inserted,span:{start:end,end,draftRev:state.draftRev}})!==true)throw Error('Native draft changed; retry annotation insertion')
  if(input.state.getSnapshot().draft!==state.draft+inserted)throw Error('Open the target role composer and retry; annotation insertion was not confirmed')
  input.focus();return sessionId
  }catch(error){rollback?.();throw error}
 }}
 child.effect(()=>child.reflect.provide('personalWorkbenchAnnotations',service))
})}
