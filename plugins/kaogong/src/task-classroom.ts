import type {StudyTask} from './study-plan.ts'

/** Local recency hint only; the Host remains the owner of task and classroom records. */
export function recentTaskKey(instanceId:string){return 'kaogong/recent-task/'+encodeURIComponent(instanceId)}

export function readRecentTaskIds(instanceId:string):string[]{
  try{
    const value=JSON.parse(window.localStorage.getItem(recentTaskKey(instanceId))??'[]')
    return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string').slice(0,100):[]
  }catch{return []}
}

export function rememberRecentTask(instanceId:string,taskId:string){
  try{window.localStorage.setItem(recentTaskKey(instanceId),JSON.stringify([taskId,...readRecentTaskIds(instanceId).filter(id=>id!==taskId)].slice(0,100)))}catch{/* Browser storage is only a recency hint. */}
}

/** A classroom belongs to a started learning task; practice and review tasks restore their own content. */
export function pickCurrentLearningTask(tasks:readonly StudyTask[],recentIds:readonly string[]):StudyTask|undefined{
  const valid=tasks.filter(task=>task.kind==='learn'&&task.status==='in-progress'&&!!task.lessonId)
  const recent=recentIds.map(id=>valid.find(task=>task.id===id)).filter((task):task is StudyTask=>!!task)
  return recent[0]??valid.at(-1)
}

/** The exact identity the Host uses to return the same classroom on a retry. */
export function taskStartRevision(task:StudyTask,planRevision:number):number{
  return task.startedFromRevision??planRevision
}
