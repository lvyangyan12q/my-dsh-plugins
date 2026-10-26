export type LearnerDraft={version:1;form:boolean;lessonId:string|null;notes:string;notesDirty:boolean;goal?:{id:string;subject:string;objective:string;knowledgePoint:string;reflections:boolean;material:boolean;legacyNoteId:string}}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max
function validate(value:unknown):LearnerDraft|null{
 if(!record(value)||value.version!==1||typeof value.form!=='boolean'||value.lessonId!==null&&!text(value.lessonId,200)||!text(value.notes,20000)||typeof value.notesDirty!=='boolean')return null
 const goal=value.goal
 if(goal!==undefined&&(!record(goal)||!text(goal.id,200)||!text(goal.subject,100)||!text(goal.objective,500)||!text(goal.knowledgePoint,500)||typeof goal.reflections!=='boolean'||typeof goal.material!=='boolean'||!text(goal.legacyNoteId,500)))return null
 return value as LearnerDraft
}
const key=(id:string)=>'kaogong/instances/'+encodeURIComponent(id)+'/learner-draft/v1'
export function readLearnerDraft(id:string):LearnerDraft|null{try{const text=window.localStorage.getItem(key(id));return!text||text.length>40000?null:validate(JSON.parse(text))}catch{return null}}
export function writeLearnerDraft(id:string,value:LearnerDraft){if(id==='default'||!validate(value))return;try{window.localStorage.setItem(key(id),JSON.stringify(value))}catch{/* Browser storage availability does not write or complete Host records. */}}
