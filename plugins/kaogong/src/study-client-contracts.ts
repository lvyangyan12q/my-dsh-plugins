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
export type StudyTask={id:string;revision:number;status:string;text:string;contexts:TeachingContext[];sessionId:string;roleId:string;notice?:string;ownerFinalization?:string;preparation?:{kind:string;id:string}}
export interface TaskFacade {
  prepare(input:{roleId:string;text:string;contexts?:{resourceId:string;selection?:unknown}[]}):Promise<StudyTask>
  prepareOwned(input:{roleId:string;kind:'lesson'|'review';payload:{roundId:string}|{lessonId:string}}):Promise<StudyTask>
  list():Promise<StudyTask[]>
  edit(input:{id:string;revision:number;text:string;contexts:TeachingContext[]}):Promise<StudyTask>
  submit(id:string,revision:number):Promise<StudyTask>
  recover(id:string):Promise<StudyTask>
  discard(id:string,revision:number):Promise<StudyTask>
}
export type StudyViewProps=StudySelection&{roles?:RoleFacade;tasks?:TaskFacade;onReturn?():void;panel?:boolean;sessionId?:string}
