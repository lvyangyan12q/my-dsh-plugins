import {useEffect,useState} from 'react'
import type {FactoryComponentPropsOf} from '@deepseek-ai/dsh-client-ui-slots'
import type {SessionReference} from '@deepseek-ai/dsh-api-session-controller/client'
import type {TeacherWindow,WindowSnapshot} from './teacher-window.ts'

function HistoryMount({owner,reference,children}:{owner:TeacherWindow;reference:SessionReference;children:React.ReactNode}) {
 useEffect(()=>owner.mount(reference),[owner,reference])
 return children
}
/** A separate native reference: viewing prior history never replaces the application's role binding. */
export function RoleHistory({sessionId,close,createHistory,SessionProvider,renderSlot,t}:FactoryComponentPropsOf<'personal-workbench.role-history'>) {
 const [view,setView]=useState<{owner:TeacherWindow;snapshot:WindowSnapshot}|null>(null)
 useEffect(()=>{
  const owner=createHistory(sessionId);let active=true
  const update=()=>{if(active)setView({owner,snapshot:owner.getSnapshot()})}
  const unsubscribe=owner.subscribe(update);update();void owner.open().catch(()=>{})
  return()=>{active=false;unsubscribe();owner.dispose()}
 },[createHistory,sessionId])
 const snapshot=view?.snapshot
 return <dialog open aria-label={t('roleHistory')} onCancel={event=>{event.preventDefault();close()}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close()}}} style={{position:'absolute',inset:8,zIndex:20,margin:0,width:'auto',height:'auto',padding:0,border:'1px solid #ddd',borderRadius:8,display:'flex',flexDirection:'column',minWidth:0,minHeight:0,background:'var(--dsw-alias-bg-base, #fff)',color:'inherit'}}>
  <header style={{display:'flex',alignItems:'center',gap:10,padding:10,borderBottom:'1px solid #ddd',flexShrink:0}}><strong style={{flex:1,overflowWrap:'anywhere'}}>{t('roleHistory')} · {sessionId}</strong><button data-pwb-button type="button" autoFocus onClick={close}>{t('roleCloseHistory')}</button></header>
  {(!snapshot||snapshot.phase==='loading'||snapshot.phase==='closed')&&<p role="status">{t('roleHistoryLoading')}</p>}
  {snapshot?.phase==='error'&&<div role="alert"><p>{t('roleHistoryUnavailable')}</p><button data-pwb-button type="button" onClick={()=>{void view?.owner.retry(sessionId).catch(()=>{})}}>{t('retry')}</button></div>}
  {view&&snapshot?.phase==='open'&&<div style={{flex:1,minWidth:0,minHeight:0,overflow:'hidden'}}><HistoryMount owner={view.owner} reference={snapshot.reference}><SessionProvider session={snapshot.reference} empty={()=><p role="alert">{t('roleHistoryUnavailable')}</p>}>{renderSlot('personal-workbench.role-native',{})}</SessionProvider></HistoryMount></div>}
 </dialog>
}
