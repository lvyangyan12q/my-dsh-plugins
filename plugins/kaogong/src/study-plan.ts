import {randomUUID} from 'node:crypto'
import {defineDomain} from '@deepseek-ai/dsh-storage-domain'
import type {DomainGlobal} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import {generatePlan,isValidIsoDate,daysToExam} from './schedule.ts'
import {TAXONOMY} from './taxonomy.ts'
const date=z.string().refine(isValidIsoDate,'日期无效')
export const studyGoal=z.object({examDate:date.nullable(),dailyModules:z.number().int().min(1).max(20),subjects:z.array(z.object({name:z.string(),weight:z.number().int().min(1).max(100)})).min(1)}).strict()
export const reviewOccurrence=z.object({roundId:z.string().uuid(),questionId:z.string().min(1).max(300)}).strict()
const task=z.object({id:z.string().uuid(),revision:z.number().int().positive(),subject:z.string(),title:z.string(),kind:z.enum(['learn','practice','review']),phase:z.enum(['foundation','reinforce','sprint']),date:date.nullable(),status:z.enum(['pending','in-progress','completed']),requirePractice:z.boolean(),requireReflections:z.boolean(),summary:z.string(),evidence:z.unknown().nullable(),startedFromRevision:z.number().optional(),lessonId:z.string().uuid().optional(),reviewOccurrence:reviewOccurrence.optional(),reviewHistoryCount:z.number().int().nonnegative().optional()})
const draft=z.object({id:z.string().uuid(),baseRevision:z.number().int().nonnegative(),action:z.string(),goal:studyGoal.nullable(),tasks:z.array(task),overflow:z.array(z.string()),diff:z.array(z.object({id:z.string(),before:task.nullable(),after:task.nullable()})),createdAt:z.string()})
export const planState=z.object({revision:z.number().int().nonnegative(),goal:studyGoal.nullable(),tasks:z.array(task),drafts:z.array(draft),history:z.array(z.object({revision:z.number(),confirmedAt:z.string(),draftId:z.string(),action:z.string(),diff:draft.shape.diff})),externalMocks:z.array(z.object({id:z.string(),date,title:z.string(),score:z.number(),maximum:z.number(),source:z.literal('learner-self-report')}))})
export type StudyTask=z.infer<typeof task>
export type StudyPlanState=z.infer<typeof planState>
export const studyPlanDomain=defineDomain({name:'kaogong_study_plan',version:1,tables:{},global:{schema:planState,initial:{revision:0,goal:null,tasks:[],drafts:[],history:[],externalMocks:[]}}})
export type PlanPreview={baseRevision:number;action:'generate'|'adjust'|'defer'|'append';today:string;goal?:z.infer<typeof studyGoal>;taskId?:string;date?:string;task?:{subject:string;title:string;kind:StudyTask['kind'];requirePractice?:boolean;requireReflections?:boolean;reviewOccurrence?:z.infer<typeof reviewOccurrence>}}
/** One atomic aggregate owns plan revisions, stable tasks and explicit proposals.
 * Existing progress/round/lesson domains are neither inferred nor rewritten. */
export class StudyPlan{
 private pending:Promise<unknown>=Promise.resolve()
 constructor(private global:DomainGlobal<StudyPlanState>,private verify:(task:StudyTask,input:{roundId?:string;lessonId?:string})=>Promise<unknown>=async()=>{throw Error('作答证据不可用')},private prepareReview:(task:StudyTask)=>Promise<number>=async()=>{throw Error('复习依据不可用')}){}
 private run<T>(op:()=>Promise<T>){const p=this.pending.then(op);this.pending=p.catch(()=>{});return p}
 read(){return structuredClone(this.global.get())}
 preview(input:PlanPreview){return this.run(async()=>{
  const current=this.read();if(input.baseRevision!==current.revision)throw Error('计划版本已变化，请刷新')
  const goal=input.goal?studyGoal.parse(input.goal):current.goal;if(goal&&(goal.subjects.some(s=>!TAXONOMY.some(row=>row.subject===s.name))||new Set(goal.subjects.map(s=>s.name)).size!==goal.subjects.length))throw Error('科目设置无效')
  if(!isValidIsoDate(input.today))throw Error('日期无效')
  let tasks=structuredClone(current.tasks)
  if(input.action==='generate'||input.action==='adjust'){
   if(goal?.examDate){if(daysToExam(input.today,goal.examDate)<1||daysToExam(input.today,goal.examDate)>1095)throw Error('考试日期须在未来三年内')
    const slots=generatePlan({...goal,examDate:goal.examDate},input.today).days.flatMap(day=>day.items.filter(row=>row.kind!=='mock').map(row=>({id:randomUUID(),revision:1,subject:row.subject,title:row.title,kind:row.kind as StudyTask['kind'],phase:day.phase,date:day.date,status:'pending' as const,requirePractice:false,requireReflections:true,summary:'',evidence:null})))
    if(!tasks.length)tasks=slots
    else{
     const protectedTasks=tasks.filter(t=>t.status!=='pending'||t.date!==null&&t.date<=input.today)
     const candidates=tasks.filter(t=>!protectedTasks.some(p=>p.id===t.id))
     const used=new Map<string,number>();for(const t of protectedTasks)if(t.date)used.set(t.date,(used.get(t.date)??0)+1)
     const available=slots.filter(s=>{const count=used.get(s.date)??0;if(count>=goal.dailyModules)return false;used.set(s.date,count+1);return true})
     tasks=[...protectedTasks,...candidates.map(t=>{const index=available.findIndex(s=>s.subject===t.subject),slot=index<0?undefined:available.splice(index,1)[0];return {...t,date:slot?.date??null,phase:slot?.phase??t.phase,revision:t.revision+1}})]
    }
   }
  }else if(input.action==='defer'){
   if(!input.date||!isValidIsoDate(input.date)||input.date<input.today)throw Error('延期日期无效')
   const row=tasks.find(t=>t.id===input.taskId);if(!row||row.status!=='pending')throw Error('只能明确延期未开始任务')
   row.date=goal&&tasks.filter(t=>t.id!==row.id&&t.date===input.date).length>=goal.dailyModules?null:input.date;row.revision++
  }else if(input.action==='append'){
   const row=input.task;if(!row||!TAXONOMY.some(t=>t.subject===row.subject)||!row.title.trim()||!['learn','practice','review'].includes(row.kind))throw Error('追加任务无效')
   if(input.date&&(!isValidIsoDate(input.date)||input.date<input.today))throw Error('追加日期无效');if(row.reviewOccurrence&&row.kind!=='review')throw Error('错题关联仅用于复习任务')
   tasks.push({id:randomUUID(),revision:1,subject:row.subject,title:row.title.trim().slice(0,500),kind:row.kind,phase:'foundation',date:input.date??null,status:'pending',requirePractice:row.requirePractice===true,requireReflections:row.requireReflections!==false,summary:'',evidence:null,...(row.reviewOccurrence?{reviewOccurrence:reviewOccurrence.parse(row.reviewOccurrence)}:{})})
  }else throw Error('计划预览操作无效')
  const counts=new Map<string,number>();for(const t of tasks.filter(t=>t.status!=='pending'))if(t.date)counts.set(t.date,(counts.get(t.date)??0)+1)
  for(const t of tasks.filter(t=>t.status==='pending'))if(t.date){const used=counts.get(t.date)??0;if(goal&&used>=goal.dailyModules&&t.date>input.today)t.date=null;else counts.set(t.date,used+1)}
  const overflow=tasks.filter(t=>t.date===null&&t.status==='pending').map(t=>t.id)
  const diff=tasks.flatMap(after=>{const before=current.tasks.find(t=>t.id===after.id)??null;return JSON.stringify(before)===JSON.stringify(after)?[]:[{id:after.id,before,after}]})
  const value={id:randomUUID(),baseRevision:current.revision,action:input.action,goal,tasks,overflow,diff,createdAt:new Date().toISOString()}
  await this.global.set({...current,drafts:[...current.drafts,value]});return value
 })}
 confirm(id:string,revision:number,confirmed:boolean){return this.run(async()=>{const state=this.read(),proposal=state.drafts.find(row=>row.id===id);if(!proposal||revision!==state.revision||proposal.baseRevision!==revision)throw Error('计划版本已变化，请重新预览');if(confirmed!==true)throw Error('需要页面明确确认');const next={...state,revision:revision+1,goal:proposal.goal,tasks:proposal.tasks,drafts:state.drafts.filter(row=>row.id!==id),history:[...state.history,{revision:revision+1,confirmedAt:new Date().toISOString(),draftId:id,action:proposal.action,diff:proposal.diff}]};await this.global.set(next);return next})}
 start(id:string,revision:number){return this.run(async()=>{const state=this.read(),row=state.tasks.find(t=>t.id===id);if(row?.status==='in-progress'&&row.startedFromRevision===revision)return state;if(state.revision!==revision)throw Error('计划版本已变化');if(!row||row.status!=='pending')throw Error('任务不可开始');if(row.reviewOccurrence)row.reviewHistoryCount=await this.prepareReview(row);row.status='in-progress';row.startedFromRevision=revision;if(row.kind==='learn')row.lessonId=randomUUID();row.revision++;state.revision++;await this.global.set(state);return state})}
 saveSummary(id:string,revision:number,summary:string){return this.run(async()=>{const state=this.read(),row=state.tasks.find(t=>t.id===id);if(state.revision!==revision)throw Error('计划版本已变化');if(!row||row.status==='completed'||typeof summary!=='string'||summary.length>4000)throw Error('任务总结不可修改');row.summary=summary.trim();row.revision++;state.revision++;await this.global.set(state);return state})}
 complete(id:string,revision:number,confirmed:boolean,input:{roundId?:string;lessonId?:string}){return this.run(async()=>{const state=this.read(),row=state.tasks.find(t=>t.id===id);if(state.revision!==revision)throw Error('计划版本已变化');if(confirmed!==true)throw Error('需要页面明确确认');if(!row||row.status==='completed')throw Error('任务不可重复完成');if(row.kind==='learn'&&!row.summary.trim())throw Error('请先保存学习总结');const proof=row.kind!=='learn'||row.requirePractice?await this.verify(row,input):null;row.evidence={summary:row.summary,proof,confirmedAt:new Date().toISOString()};row.status='completed';row.revision++;state.revision++;state.history.push({revision:state.revision,confirmedAt:new Date().toISOString(),draftId:id,action:'learner-confirmed-completion',diff:[{id,before:this.read().tasks.find(t=>t.id===id)!,after:row}]});await this.global.set(state);return state})}
 recordExternalMock(input:{date:string;title:string;score:number;maximum:number},revision:number,confirmed:boolean){return this.run(async()=>{const state=this.read();if(state.revision!==revision)throw Error('计划版本已变化');if(confirmed!==true||!isValidIsoDate(input.date)||!input.title.trim()||!Number.isFinite(input.score)||!Number.isFinite(input.maximum)||input.maximum<=0||input.score<0||input.score>input.maximum)throw Error('外部自报成绩无效');state.externalMocks.push({...input,title:input.title.trim().slice(0,500),id:randomUUID(),source:'learner-self-report'});state.revision++;await this.global.set(state);return state})}
 async close(){await this.pending}
}

