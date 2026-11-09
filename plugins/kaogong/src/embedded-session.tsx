/**
 * 课堂内嵌的真实老师会话。
 *
 * 只用公开能力：`ctx.sessions.retain` 取得指定原生会话的引用，公开
 * `SessionProvider` 建立会话作用域，公开 `conversation.content` Factory 复用原生
 * 消息流、工具过程、提问/审批浮层、Stop 与输入框。这里不自造聊天框，也不读取
 * 或复制消息缓存。
 */
import {useEffect,useState} from 'react'
import type {ISessions,SessionReference} from '@deepseek-ai/dsh-api-session-controller/client'
import type {PropsRenderFactories,PropsRenderSlots,PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {ConversationViewsProps} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {SessionId} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** 考公课堂的答疑区，与原生主视图、右侧栏都相互独立地持有一个引用。 */
    kaogongClassroom: unknown
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 根作用域里的一个真实老师会话；自己建立会话作用域，因此课堂外壳不需要会话绑定。 */
    'kaogong.teacher.session': {kind:'single';scope:'root';owner:{sessionId:string}}
    /** 会话作用域内的原生对话内容；只在本 slot 渲染，课堂之外不会出现第二个输入框。 */
    'kaogong.teacher.body': {kind:'single';scope:'session'}
  }
}

/** 会话引用来源标签；退出课堂时按引用计数释放，不改变导航。 */
export const teacherSessionSource='kaogongClassroom'

export type TeacherSessionHostProps=PropsRuntime<'kaogong.teacher.session'>&PropsRenderSlots<'kaogong.teacher.body'>&{
  /** 公开会话保留能力（`ctx.sessions` 的 retain 面）。 */
  sessions:Pick<ISessions,'retain'>
}

/** 保留指定原生会话并把它包进公开会话作用域；任何失败都如实显示，不伪造对话。 */
export function TeacherSessionHost({sessionId,sessions,SessionProvider,renderSlot}:TeacherSessionHostProps){
  const [reference,setReference]=useState<SessionReference|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    let retained:SessionReference|undefined
    try{
      retained=sessions.retain(sessionId as SessionId,{source:teacherSessionSource,signal:controller.signal})
    }catch(cause){
      setReference(null);setError(cause instanceof Error?cause.message:'老师会话无法打开')
      return ()=>{controller.abort()}
    }
    setError('');setReference(retained)
    return ()=>{controller.abort();retained?.release()}
  },[sessionId,sessions])
  if(error)return <p role="alert" className="kg-teacher-session-error">{error}</p>
  // 切会话时上一帧的引用已不再使用，先显示真实状态而不是把旧会话当成新会话。
  if(!reference||reference.sessionId!==sessionId)return <p role="status" className="kg-teacher-session-status">正在打开老师会话…</p>
  return <div className="kg-teacher-session-embed" data-kaogong-teacher-embed={sessionId}>
    <SessionProvider session={reference}>{renderSlot('kaogong.teacher.body',{})}</SessionProvider>
  </div>
}

export type TeacherSessionBodyProps=PropsRuntime<'kaogong.teacher.body'>&PropsRenderFactories

/** 原生 Conversation Factory 的嵌入式出现：内容、流式、工具、审批、提问、Stop 与输入都归原生所有。 */
export function TeacherSessionBody({renderFactorySlot}:TeacherSessionBodyProps){
  return <>{renderFactorySlot('conversation.content',{variant:'embedded',phase:'active',hero:false},{slots:{views:FixedChatConversationView}})}</>
}

/** 固定原生 chat 视图，其它原生视图不进入课堂（完整对话仍由显式入口打开）。 */
export function FixedChatConversationView({renderSlot}:ConversationViewsProps){
  return <>{renderSlot('conversation.session',{view:'chat'})}</>
}
