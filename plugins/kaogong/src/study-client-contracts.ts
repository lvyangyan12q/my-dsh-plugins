import type {ReactNode} from 'react'

export type StudyProfile={id:string;kind:'learner'|'library';title:string;revision:number;goal?:{examDate?:string}}
export type StudyView={id:string;profileId:string}
export type StudySelection={profile:StudyProfile;view:StudyView;roleId?:string}
export type StudyDirectory={profiles:StudyProfile[];views:StudyView[];lastProfileId?:string}
export type RoleBinding={phase:'intent'|'ready';sessionId:string;revision:number}
export interface RoleFacade {
  read(roleId:string):Promise<unknown>
  ensure(roleId:string):Promise<RoleBinding>
  open(roleId:string,sessionId:string,revision:number):Promise<void>
}
export type TeachingContext={id:string;title:string;text:string}
export type StudyTask={id:string;revision:number;status:string;text:string;contexts:TeachingContext[];sessionId:string;roleId:string;notice?:string;ownerFinalization?:string;preparation?:{kind:string;id:string};taskSession?:{taskId:string;lessonId:string;roleId:string;revision:number}}
export interface TaskFacade {
  prepare(input:{roleId:string;text:string;contexts?:{resourceId:string;selection?:unknown}[]}):Promise<StudyTask>
  prepareOwned(input:{roleId:string;kind:'lesson'|'review';actionId?:string;payload:{roundId:string}|{lessonId:string;intent?:string;quizIntent?:{questionId:string;section:string;choice:number}}}):Promise<StudyTask>
  list():Promise<StudyTask[]>
  edit(input:{id:string;revision:number;text:string;contexts:TeachingContext[]}):Promise<StudyTask>
  submit(id:string,revision:number):Promise<StudyTask>
  recover(id:string):Promise<StudyTask>
  discard(id:string,revision:number):Promise<StudyTask>
  /** The task's own native teacher Session; absent in older hosts, which keep the role Session. */
  session?(taskId:string):Promise<{sessionId:string;revision:number}>
  /** Reveal the task's own native Session (validated by the Host) after preparing its teaching task. */
  open?(taskId:string):Promise<void>
}
export type StudyViewProps=StudySelection&{roles?:RoleFacade;tasks?:TaskFacade;onReturn?():void;panel?:boolean;sessionId?:string
  /** 课堂内嵌真实老师会话的位置；缺席时课堂不挂任何对话（例如右栏面板）。 */
  renderTeacherSession?(sessionId:string):ReactNode}
