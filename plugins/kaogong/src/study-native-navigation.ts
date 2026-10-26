export type StudySessionNavigation = {sessionId:string;profileId:string;viewId:string}
type NativeNavigation = {
  uiWorkspace:{openSession(id:string):void}
  sidebarRight:{mounted:{getSnapshot():string|undefined;subscribe(listener:()=>void):()=>void};openTab(kind:string,options:{params:StudySessionNavigation}):void}
}

/** Native owns the Conversation. This operation only reveals the exact bound
 * Session and waits for its surface before opening the learning tab. */
export async function openNativeStudySession(native:NativeNavigation, target:StudySessionNavigation, signal:AbortSignal):Promise<void> {
  if(signal.aborted)throw new Error('学习导航已取消')
  native.uiWorkspace.openSession(target.sessionId)
  await new Promise<void>((resolve,reject)=>{
    let remove=()=>{},timer:ReturnType<typeof setTimeout>|undefined
    const finish=(error?:Error)=>{remove();if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve()}
    const abort=()=>finish(new Error('学习导航已取消'))
    const check=()=>{if(native.sidebarRight.mounted.getSnapshot()===target.sessionId)finish()}
    remove=native.sidebarRight.mounted.subscribe(check)
    signal.addEventListener('abort',abort,{once:true})
    timer=setTimeout(()=>finish(new Error('原生会话尚未挂载，请重新打开学习面板')),10000)
    check()
  })
  // The public mounted source names the arriving Session before React commits
  // its surface. Open from the next frame, after the native seat adopted it.
  await new Promise<void>(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>resolve()):setTimeout(resolve,0))
  if(signal.aborted||native.sidebarRight.mounted.getSnapshot()!==target.sessionId)throw new Error('学习导航已变化')
  native.sidebarRight.openTab('kaogong-learning',{params:target})
}
