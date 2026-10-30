import {createContext,useContext,useMemo} from 'react'
import type {ImgHTMLAttributes} from 'react'
import type {ViewTransport} from './client-runtime.ts'
import type {RoleFacade,TaskFacade} from './study-client-contracts.ts'
import {practiceRequest,readPracticeDraft,savePracticeDraft,readAdmittedReviews,markAdmittedReview} from './practice-client.ts'

export const KaogongTransportContext=createContext<ViewTransport|null>(null)
export const KaogongServicesContext=createContext<{roles?:RoleFacade;tasks?:TaskFacade}|null>(null)
export function useViewServices(){return useContext(KaogongServicesContext)}
/** Historical direct consumers do not install a renderer or gain an implicit new instance. */
const legacyHttp={fetch:(input:string,init?:RequestInit)=>fetch(input,init),url:(input:string)=>input}
export function useLearningHttp(){return useContext(KaogongTransportContext)??legacyHttp}
export function usePracticeClient(){
  const transport=useContext(KaogongTransportContext)
  return useMemo(()=>({
    practiceRequest:<T,>(action:string,body:unknown):Promise<T>=>transport?transport.json<T>('/api/kaogong/practice/'+action,body):practiceRequest<T>(action,body),
    readPracticeDraft:(roundId?:string)=>readPracticeDraft(transport?.instanceId,roundId),
    savePracticeDraft:(draft:Parameters<typeof savePracticeDraft>[0])=>savePracticeDraft(draft,transport?.instanceId),
    readAdmittedReviews:()=>readAdmittedReviews(transport?.instanceId),
    markAdmittedReview:(id:string)=>markAdmittedReview(id,transport?.instanceId),
  }),[transport])
}
/** Render-time scoping preserves original stored material references. */
export function ScopedMaterialImage(props:ImgHTMLAttributes<HTMLImageElement>){
  const http=useLearningHttp()
  let src:string|undefined
  try{src=typeof props.src==='string'?http.url(props.src):undefined}catch{return <span>[图片引用不可用]</span>}
  return <img {...props} src={src}/>
}
