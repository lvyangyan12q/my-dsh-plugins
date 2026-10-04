import {useSyncExternalStore} from 'react'
import type {RecipeModuleProps} from './recipe-view.tsx'
const emptyRoles=new Map()
const subscribeEmpty=()=>()=>{}
const getEmptyRoles=()=>emptyRoles
const getEmptySession=()=>null
/** Observe the associated role without acquiring a Session or attributing shared-role turns to this module. */
export function ModuleSessionState({ctx,appId,instanceId,module,t}:RecipeModuleProps){
 const roles=ctx?.get('personalWorkbenchRoles')?.view
 const states=useSyncExternalStore(roles?.subscribe??subscribeEmpty,roles?.getSnapshot??getEmptyRoles)
 const state=states.get(JSON.stringify([appId,instanceId,module.roleId,null]))
 const session=state?.window.phase==='open'?state.window.reference.binding.session:undefined
 const snapshot=useSyncExternalStore(session?.subscribe??subscribeEmpty,session?.getSnapshot??getEmptySession)
 const failure=state?.error??snapshot?.promptError?.error.message??snapshot?.openError?.message??snapshot?.lastAgentError
 if(!state)return null
 return <div aria-label={t('moduleAssociatedSession')}>
  <p role="status">{t('moduleAssociatedSession')}: {t(snapshot?.running?'moduleSessionRunning':failure?'moduleSessionFailed':state.busy||state.window.phase==='loading'?'moduleSessionConnecting':'moduleSessionIdle')}</p>
  {failure&&<p role="alert">{failure}</p>}
 </div>
}
