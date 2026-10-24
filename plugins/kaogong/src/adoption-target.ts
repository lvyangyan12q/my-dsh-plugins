import type {KaogongInstanceState} from './instance-state.ts'
import type {AdoptionTarget} from './legacy-adoption-workflow.ts'
import {instanceDomainSpecs} from './domain.ts'
import {questionRecord,bankQuestion,knowledgeEntry,practiceRound,dayPlan,planConfig} from './schemas.ts'
import {lessonRecord,lessonSelection} from './lesson-schema.ts'
/** Domain API only. Parsing is repeated at the write boundary after exact-shape planning. */
export function adoptionTarget(state:KaogongInstanceState):AdoptionTarget{
 const specs=instanceDomainSpecs(state.instanceId)
 return {
  read(domain,key){switch(domain){case'notebook':return state.questions.get(key);case'bank':return state.bankQuestions.get(key);case'knowledge':return state.knowledgeEntries.get(key);case'practice':return state.rounds.get(key);case'progress':return state.days.get(key);case'lessons':return state.lessonRecords.get(key)}},
  async write(domain,key,value){switch(domain){case'notebook':return state.questions.put(key,questionRecord.parse(value));case'bank':return state.bankQuestions.put(key,bankQuestion.parse(value));case'knowledge':return state.knowledgeEntries.put(key,knowledgeEntry.parse(value));case'practice':return state.rounds.put(key,practiceRound.parse(value));case'progress':return state.days.put(key,dayPlan.parse(value));case'lessons':return state.lessonRecords.put(key,lessonRecord.parse(value))}},
  global:domain=>domain==='progress'?state.planConfig.get():state.lessonSelection.get(),
  initialGlobal:domain=>domain==='progress'?specs.progress.global.initial:specs.lessons.global.initial,
  setGlobal:(domain,value)=>domain==='progress'?state.planConfig.set(planConfig.parse(value)):state.lessonSelection.set(lessonSelection.parse(value)),
 }
}
