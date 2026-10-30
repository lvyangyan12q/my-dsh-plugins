import type {PracticeCounts} from './practice-statistics.ts'

type Statistics = PracticeCounts & {errorReasons?:{reason:string;count:number}[]}
/** Counts reflect scored question slots, independently from task completion or self-reported exams. */
export function PracticeStatisticsPanel({statistics,detailed=false}:{statistics?:Statistics;detailed?:boolean}) {
  if(!statistics?.submittedCount)return <section aria-label="系统判分练习统计"><h3>系统判分练习</h3><p>尚无已提交轮次。</p></section>
  const rows=[['累计提交',statistics.submittedCount],['实际作答',statistics.answeredCount],['未答',statistics.unansweredCount],['去重题数',statistics.uniqueQuestionCount],['做对',statistics.correctCount],['已答做错',statistics.incorrectCount]] as const
  return <section aria-label="系统判分练习统计"><h3>系统判分练习</h3><dl className="kg-metrics">{rows.map(([title,count])=><div key={title}><dt>{title}</dt><dd>{count}</dd></div>)}</dl><p><strong>{Math.round(statistics.accuracyRate*100)}%</strong> · 以全部提交题量为分母（含未答），共{statistics.submittedRoundCount}个已提交轮次。同一题在不同轮次分别计入提交题量。</p>{detailed&&<><h3>跨轮次错因</h3>{statistics.errorReasons?.length?statistics.errorReasons.map(row=><p key={row.reason}>{row.reason} · {row.count}次</p>):<p>尚无已保存的错因归纳。</p>}</>}</section>
}
