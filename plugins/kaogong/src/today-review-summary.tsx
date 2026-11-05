import {PracticeStatisticsPanel} from './practice-statistics-panel.tsx'
import {useEffect,useState} from 'react'
import {useLearningHttp} from './view-context.tsx'
import {useBusinessState} from './view-state.tsx'
export function TodayReviewSummary({onOpen}:{onOpen():void}) {
 const http=useLearningHttp(),[dashboard]=useBusinessState('dashboard',null)
 const [counts,setCounts]=useState<{due:number;future:number}|null>(null),[error,setError]=useState('')
 useEffect(()=>{let current=true;setCounts(null);setError('');void Promise.all(['/api/kaogong/recall','/api/kaogong/errors?mode=review'].map(async path=>{const response=await http.fetch(path);if(!response.ok)throw Error('暂时无法读取复习提醒');return response.json()})).then(([recalls,errors])=>{if(!current)return;const dates=[...(recalls.items??[]).map((r:{dueAt:string})=>r.dueAt),...(errors.occurrences??[]).filter((r:{review?:{status:string}})=>r.review&&r.review.status!=='consolidated').map((r:{review:{dueAt:string}})=>r.review.dueAt)];const now=new Date().toISOString();setCounts({due:dates.filter(d=>d<=now).length,future:dates.filter(d=>d>now).length})}).catch(e=>{if(current)setError(String(e))});return()=>{current=false}},[http])
 return <section aria-label="到期复习"><p>{dashboard?.examDate?'考试目标：'+dashboard.examDate:'考试目标待设置'}</p><h2>到期复习</h2><p>{counts?`到期与逾期 ${counts.due} 项 · 后续 ${counts.future} 项`:'正在读取两类复习提醒…'}</p>{error&&<p role="alert">{error}</p>}<button onClick={onOpen}>进入复习中心</button><details><summary>查看练习记录摘要</summary><PracticeStatisticsPanel statistics={dashboard?.practiceStatistics}/></details></section>
}
