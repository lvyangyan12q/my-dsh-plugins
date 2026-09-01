import { useCallback, useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

type DashboardData = {
  today: string
  examDate: string
  daysToExam: number
  totalDays: number
  pastDays: number
  pastDone: number
  pastDonePct: number
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  accuracyRate: number
  bankTotal: number
  knowledgeTotal: number
  todayPlan: { phase: string; items: { subject: string; kind: string; title: string; done: boolean }[] }
  modules: { subject: string; availableCount: number; practicedCount: number; wrongCount: number; accuracyRate: number }[]
  weakPoints: { subject: string; knowledgePoint: string; wrongCount: number; errorRate: number }[]
  recentKnowledge: { id: string; title: string; subject: string; knowledgePoint: string; kind: string; content: string; updatedAt: string }[]
}

type FooterProps = PropsRuntime<'sidebar.footer.action'>

type PracticeQuestion = { id: string; subject: string; knowledgePoint: string; stem: string; options: string[]; difficulty: string }
type PracticeData = { reason: string; totalAvailable: number; returned: number; cycled: boolean; questions: PracticeQuestion[] }
type PracticeResult = {
  totalCount: number
  correctCount: number
  accuracyRate: number
  results: { id: string; knowledgePoint: string; correct: boolean; correctAnswer: string; explanation: string }[]
}
type PracticeContext = { subject: string; title: string; knowledgePoint?: string; limit: number; planIndex?: number }
type ModuleSummary = {
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  accuracyRate: number
  weakPoints: { knowledgePoint: string; wrongCount: number; totalCount: number; errorRate: number; topReasons: string[]; suggestion: string }[]
  suggestions: string[]
}

const colors = {
  ink: '#202124',
  muted: '#6b7280',
  line: '#e5e7eb',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  red: '#dc2626',
  green: '#15803d',
}
const errorReasons = ['知识点不会', '概念混淆', '审题不清', '计算/分析失误', '粗心大意', '方法不当/技巧缺失', '时间不够', '记忆模糊', '其他']

function pct(value: number): string { return `${Math.round(value * 100)}%` }

function materialImageUrl(source: string): string {
  const normalized = source.replaceAll('\\', '/')
  const marker = '题目_images/'
  const index = normalized.indexOf(marker)
  if (index < 0) return source
  const asset = normalized.slice(index + marker.length)
  return `/api/kaogong/material-image?asset=${encodeURIComponent(asset)}`
}

// 解析 stem 中的 Markdown 图片语法，返回 React 元素数组
function renderStem(stem: string) {
  const parts: React.ReactNode[] = []
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(stem)) !== null) {
    // 添加图片前的文本
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>{stem.slice(lastIndex, match.index)}</span>)
    }
    // 添加图片
    const alt = match[1]
    const src = materialImageUrl(match[2])
    parts.push(
      <figure key={`img-${match.index}`} style={{ margin: '12px 0' }}>
        <img
          src={src}
          alt={alt}
          style={{ display: 'block', maxWidth: '100%', height: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            const caption = e.currentTarget.nextElementSibling as HTMLElement | null
            if (caption) caption.style.display = 'block'
          }}
        />
        <figcaption style={{ display: 'none', color: colors.red, fontSize: 12 }}>材料图表加载失败</figcaption>
      </figure>
    )
    lastIndex = regex.lastIndex
  }
  // 添加剩余文本
  if (lastIndex < stem.length) {
    parts.push(<span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>{stem.slice(lastIndex)}</span>)
  }
  return parts
}

function phaseLabel(value: string): string {
  return value === 'sprint' ? '冲刺阶段' : value === 'reinforce' ? '强化阶段' : '基础阶段'
}

function topicOf(item: DashboardData['todayPlan']['items'][number]): string {
  const marker = item.title.lastIndexOf('：')
  return marker >= 0 ? item.title.slice(marker + 1).trim() : item.title
}

function optionValue(option: string): string {
  return /^\s*([A-Za-z])(?:[.、)\s]|$)/.exec(option)?.[1]?.toUpperCase() ?? option
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const raw = await response.text()
  let value: (T & { error?: string }) | undefined
  try {
    value = JSON.parse(raw) as T & { error?: string }
  } catch {
    if (!response.ok) {
      throw new Error(response.status === 404
        ? '练习服务尚未加载，请关闭旧的 dsh web 后重新启动。'
        : raw || `请求失败 (${response.status})`)
    }
    throw new Error('服务返回了无法识别的数据')
  }
  if (!response.ok) throw new Error(value.error || `请求失败 (${response.status})`)
  return value
}

function KaogongDashboard({ wide, ctx }: FooterProps & { ctx: ClientContext }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [practice, setPractice] = useState<PracticeData | null>(null)
  const [practiceItem, setPracticeItem] = useState<PracticeContext | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [seenQuestionIds, setSeenQuestionIds] = useState<string[]>([])
  const [errorReasonsByQuestion, setErrorReasonsByQuestion] = useState<Record<string, string>>({})
  const [moduleSummary, setModuleSummary] = useState<ModuleSummary | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/kaogong/dashboard', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`加载失败 (${response.status})`)
      setData(await response.json() as DashboardData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) void refresh() }, [open, refresh])

  const toggleItem = async (index: number, done: boolean) => {
    if (data === null) return
    try {
      const response = await fetch('/api/kaogong/plan/done', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: data.today, index, done }),
      })
      if (!response.ok) throw new Error('打卡失败')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const openTeacher = async (item: PracticeContext, review?: PracticeResult) => {
    const topic = item.title
    const prompt = review === undefined
      ? `你是武汉公务员考试 ${item.subject} 的任课老师。请围绕“${topic}”带我完成一节 25 分钟微课。先调用 kaogong_knowledge_search 检索讲义；再按核心概念、判题步骤、易错点、例题演示讲解。最后布置 3 个可核验任务，并让我完成后用 kaogong_plan_done 打卡。`
      : `你是武汉公务员考试 ${item.subject} 的辅导老师。请讲评我刚完成的“${topic}”练习：${review.correctCount}/${review.totalCount} 题正确。先调用 kaogong_analyze_errors 分析错因，再逐题解释正确思路，最后给出明天的 3 项巩固任务，并让我用 kaogong_plan_done 打卡。`
    try {
      await navigator.clipboard.writeText(prompt)
      setNotice(review === undefined ? '老师讲解提示已复制，并已打开新对话。' : '课后讲评提示已复制，并已打开新对话。')
    } catch {
      setNotice('已打开老师对话。')
    }
    ctx.uiWorkspace.startSession()
  }

  const loadPractice = async (item: PracticeContext, excludeIds: string[], resetSeen: boolean) => {
    setPracticeItem(item)
    setPractice(null)
    setResult(null)
    setAnswers({})
    setErrorReasonsByQuestion({})
    setModuleSummary(null)
    if (resetSeen) setSeenQuestionIds([])
    try {
      const value = await postJson<PracticeData>('/api/kaogong/practice/start', {
        subject: item.subject, ...(item.knowledgePoint ? { knowledgePoint: item.knowledgePoint } : {}), limit: item.limit, excludeIds,
      })
      setPractice(value)
      setSeenQuestionIds(previous => [...new Set([...previous, ...value.questions.map(question => question.id)])])
      if (value.questions.length === 0) setNotice('当前题库没有匹配题，可以让老师按本节知识点出题。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const startPlanPractice = (item: DashboardData['todayPlan']['items'][number], index: number) => {
    void loadPractice({ subject: item.subject, title: topicOf(item), knowledgePoint: topicOf(item), limit: 10, planIndex: index }, [], true)
  }

  const startModulePractice = (subject: string) => {
    void loadPractice({ subject, title: '模块练习', limit: 10 }, [], true)
  }

  const repeatPractice = () => {
    if (practiceItem === null) return
    void loadPractice(practiceItem, seenQuestionIds, false)
  }

  const submitPractice = async () => {
    if (practice === null) return
    try {
      const value = await postJson<PracticeResult>('/api/kaogong/practice/submit', {
        answers: practice.questions.map(question => ({ id: question.id, answer: answers[question.id] ?? '' })),
      })
      setResult(value)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const saveReflection = async () => {
    if (practiceItem === null || result === null) return
    const wrongResults = result.results.filter(entry => !entry.correct)
    if (wrongResults.some(entry => !errorReasonsByQuestion[entry.id])) {
      setError('请先为每道错题选择错误原因。')
      return
    }
    try {
      const value = await postJson<{ summary: ModuleSummary }>('/api/kaogong/practice/reflection', {
        subject: practiceItem.subject,
        entries: wrongResults.map(entry => ({ id: entry.id, errorReason: errorReasonsByQuestion[entry.id] })),
      })
      setModuleSummary(value.summary)
      setNotice('错因已保存，已生成本模块的错题归纳。')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <>
      <button
        type="button"
        title="打开考公学习看板"
        aria-label="打开考公学习看板"
        onClick={() => { setOpen(true) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8,
          width: '100%', minHeight: 36, padding: wide ? '7px 10px' : 0, border: 0, borderRadius: 9,
          background: 'transparent', color: colors.ink, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: colors.blueSoft, color: colors.blue, fontSize: 12, fontWeight: 700 }}>考</span>
        {wide && <span>考公学习</span>}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="考公学习看板" style={{ position: 'fixed', inset: 0, zIndex: 1000, overflow: 'auto', background: '#f8fafc', color: colors.ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px clamp(18px, 4vw, 52px) 48px' }}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
              <div>
                <div style={{ color: colors.blue, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>KAOGONG STUDY</div>
                <h1 style={{ margin: '6px 0 4px', fontSize: 30, lineHeight: 1.2 }}>考公学习看板</h1>
                <div style={{ color: colors.muted, fontSize: 14 }}>今天 {data?.today ?? '加载中'} · 聚焦行测与申论</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => { void refresh() }} disabled={loading} style={buttonStyle(false)}>{loading ? '刷新中' : '刷新'}</button>
                <button type="button" onClick={() => { setOpen(false) }} aria-label="关闭看板" style={buttonStyle(true)}>关闭</button>
              </div>
            </header>
            {notice && <div style={{ ...sectionStyle, marginBottom: 14, color: colors.blue, borderColor: '#bfdbfe', background: '#f8fbff' }}>{notice}</div>}
            {error && <div style={{ ...sectionStyle, color: colors.red, borderColor: '#fecaca', background: '#fff1f2' }}>{error}</div>}
            {data !== null && <>
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <Metric label="距离考试" value={`${data.daysToExam}`} suffix="天" accent={colors.blue} />
                <Metric label="计划完成" value={pct(data.pastDonePct)} suffix={`${data.pastDone}/${data.pastDays} 天`} accent={colors.green} />
                <Metric label="做题正确率" value={pct(data.accuracyRate)} suffix={`${data.totalQuestions} 题`} accent={colors.red} />
                <Metric label="知识库" value={`${data.knowledgeTotal}`} suffix={`讲义/笔记 · 题库 ${data.bankTotal}`} accent="#7c3aed" />
              </section>
              <section style={{ ...sectionStyle, marginBottom: 18 }}>
                <SectionTitle title="模块练习" extra="每组 10 题 · 可循环练习" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, paddingTop: 14 }}>
                  {data.modules.map(module => <article key={module.subject} style={{ padding: 13, border: `1px solid ${colors.line}`, borderRadius: 7, background: '#fff' }}>
                    <strong style={{ display: 'block', fontSize: 14 }}>{module.subject}</strong>
                    <div style={{ margin: '7px 0 12px', color: colors.muted, fontSize: 12 }}>题库 {module.availableCount} 题 · 已练 {module.practicedCount} 题{module.practicedCount > 0 ? ` · 正确率 ${pct(module.accuracyRate)}` : ''}</div>
                    <button type="button" disabled={module.availableCount === 0} onClick={() => { startModulePractice(module.subject) }} style={{ ...smallButton, opacity: module.availableCount === 0 ? .45 : 1, cursor: module.availableCount === 0 ? 'not-allowed' : 'pointer' }}>{module.availableCount === 0 ? '暂无题目' : '开始 10 题练习'}</button>
                  </article>)}
                </div>
              </section>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: 18, alignItems: 'start' }}>
                <section style={sectionStyle}>
                  <SectionTitle title="今日计划" extra={`${phaseLabel(data.todayPlan.phase)} · ${data.today}`} />
                  {data.todayPlan.items.length === 0 && <Empty text="今天暂无计划，请在对话中说“帮我生成学习计划”。" />}
                  {data.todayPlan.items.map((item, index) => <div key={`${item.subject}-${item.title}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '13px 0', borderBottom: index === data.todayPlan.items.length - 1 ? 0 : `1px solid ${colors.line}` }}>
                    <input type="checkbox" checked={item.done} onChange={event => { void toggleItem(index, event.target.checked) }} aria-label={`完成 ${item.title}`} style={{ accentColor: colors.blue }} />
                    <span style={{ minWidth: 0, textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? .55 : 1 }}><strong style={{ display: 'block', fontSize: 14 }}>{item.title}</strong><small style={{ color: colors.muted }}>{item.subject} · {item.kind}</small></span>
                    <span style={{ display: 'flex', gap: 6 }}><button type="button" onClick={() => { void openTeacher({ subject: item.subject, title: topicOf(item), limit: 10, planIndex: index }) }} style={smallButton}>讲解</button><button type="button" onClick={() => { startPlanPractice(item, index) }} style={smallButton}>练习</button></span>
                  </div>)}
                </section>
                <section style={sectionStyle}>
                  <SectionTitle title="薄弱考点" extra="按错题聚合" />
                  {data.weakPoints.length === 0 && <Empty text="还没有错题记录，完成练习后这里会自动生成。" />}
                  {data.weakPoints.map(point => <div key={`${point.subject}-${point.knowledgePoint}`} style={{ padding: '11px 0', borderBottom: `1px solid ${colors.line}` }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><strong>{point.knowledgePoint}</strong><span style={{ color: colors.red }}>{point.wrongCount} 错</span></div><div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>{point.subject} · 错误率 {pct(point.errorRate)}</div><div style={{ height: 5, marginTop: 8, borderRadius: 99, background: '#fee2e2' }}><div style={{ width: `${Math.min(100, point.errorRate * 100)}%`, height: '100%', borderRadius: 99, background: colors.red }} /></div></div>)}
                </section>
              </div>
              {practiceItem && <section style={{ ...sectionStyle, marginTop: 18, borderTop: `3px solid ${colors.blue}` }}>
                <SectionTitle title={result ? '课后复盘' : '本节练习'} extra={`${practiceItem.subject} · ${practiceItem.title}`} />
                {practice === null && result === null && <p style={{ margin: '16px 0 0', color: colors.muted }}>正在准备题目...</p>}
                {practice !== null && result === null && <div style={{ paddingTop: 14 }}>
                  <p style={{ margin: '0 0 14px', color: colors.muted, fontSize: 13 }}>{practice.reason}{practice.cycled ? ' · 已完成一轮，当前开始循环抽题' : ''} · {practice.returned}/{practice.totalAvailable} 题</p>
                  {practice.questions.length === 0 && <button type="button" onClick={() => { void openTeacher(practiceItem) }} style={buttonStyle(true)}>让老师出题</button>}
                  {practice.questions.map((question, index) => <article key={question.id} style={{ padding: '14px 0', borderBottom: `1px solid ${colors.line}` }}>
                    <div style={{ color: colors.muted, fontSize: 12 }}>第 {index + 1} 题 · {question.knowledgePoint} · {question.difficulty}</div>
                    <div style={{ margin: '8px 0', lineHeight: 1.65, overflowWrap: 'anywhere' }}>{renderStem(question.stem)}</div>
                    <div style={{ display: 'grid', gap: 6 }}>{question.options.map(option => <label key={option} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', border: `1px solid ${answers[question.id] === optionValue(option) ? '#93c5fd' : colors.line}`, borderRadius: 6, cursor: 'pointer', background: answers[question.id] === optionValue(option) ? colors.blueSoft : '#fff' }}><input type="radio" name={question.id} checked={answers[question.id] === optionValue(option)} onChange={() => setAnswers(previous => ({ ...previous, [question.id]: optionValue(option) }))} /><span>{option}</span></label>)}</div>
                  </article>)}
                  {practice.questions.length > 0 && <button type="button" onClick={() => { void submitPractice() }} style={{ ...buttonStyle(true), marginTop: 16 }}>提交判分</button>}
                </div>}
                {result && <div style={{ paddingTop: 14 }}>
                  <div style={{ padding: 12, borderRadius: 6, background: result.accuracyRate >= .8 ? '#f0fdf4' : '#fff7ed', color: result.accuracyRate >= .8 ? colors.green : '#9a3412' }}><strong>{result.correctCount}/{result.totalCount} 题正确，正确率 {pct(result.accuracyRate)}</strong></div>
                  {result.results.map(entry => <div key={entry.id} style={{ padding: '12px 0', borderBottom: `1px solid ${colors.line}` }}><strong style={{ color: entry.correct ? colors.green : colors.red }}>{entry.correct ? '正确' : '需要复盘'} · {entry.knowledgePoint}</strong>{!entry.correct && <><p style={{ margin: '5px 0 0', color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>正确答案：{entry.correctAnswer}{entry.explanation ? `。${entry.explanation}` : ''}</p><select aria-label={`选择 ${entry.knowledgePoint} 的错误原因`} value={errorReasonsByQuestion[entry.id] ?? ''} onChange={event => setErrorReasonsByQuestion(previous => ({ ...previous, [entry.id]: event.target.value }))} style={{ marginTop: 8, minHeight: 30, border: `1px solid ${colors.line}`, borderRadius: 5, color: colors.ink }}><option value="">选择错误原因</option>{errorReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></>}</div>)}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}><button type="button" onClick={() => { void openTeacher(practiceItem, result) }} style={buttonStyle(true)}>老师讲评</button><button type="button" onClick={() => { void saveReflection() }} style={buttonStyle(false)}>保存错因并总结</button><button type="button" onClick={repeatPractice} style={buttonStyle(false)}>再来 {practiceItem.limit} 题</button>{practiceItem.planIndex !== undefined && <button type="button" onClick={() => { void toggleItem(practiceItem.planIndex!, true) }} style={buttonStyle(false)}>完成任务</button>}</div>
                  {moduleSummary && <div style={{ marginTop: 16, padding: 14, border: `1px solid #bfdbfe`, borderRadius: 7, background: '#f8fbff' }}><strong>本模块错题归纳</strong><div style={{ marginTop: 7, color: colors.muted, fontSize: 13 }}>累计 {moduleSummary.totalQuestions} 题，做错 {moduleSummary.totalWrong} 题，正确率 {pct(moduleSummary.accuracyRate)}</div>{moduleSummary.weakPoints.length > 0 && <div style={{ marginTop: 10 }}>{moduleSummary.weakPoints.map(point => <div key={point.knowledgePoint} style={{ marginTop: 7, fontSize: 13 }}><strong>{point.knowledgePoint}</strong>：错 {point.wrongCount}/{point.totalCount}，主要错因 {point.topReasons.join('、')}。{point.suggestion}</div>)}</div>}</div>}
                </div>}
              </section>}
              <section style={{ ...sectionStyle, marginTop: 18 }}>
                <SectionTitle title="最近收录的讲义与笔记" extra={`${data.knowledgeTotal} 条资料`} />
                {data.recentKnowledge.length === 0 && <Empty text="还没有资料。可在对话中粘贴讲义内容，并说“整理到考公知识库”。" />}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>{data.recentKnowledge.map(entry => <article key={entry.id} style={{ padding: 14, border: `1px solid ${colors.line}`, borderRadius: 8, background: '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: colors.muted, fontSize: 11 }}><span>{entry.kind}</span><span>{entry.subject}</span></div><h3 style={{ margin: '8px 0 6px', fontSize: 14 }}>{entry.title}</h3><p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>{entry.content}</p></article>)}</div>
              </section>
            </>}
            {data === null && !error && <div style={sectionStyle}>正在读取学习数据…</div>}
          </div>
        </div>
      )}
    </>
  )
}

function Metric({ label, value, suffix, accent }: { label: string; value: string; suffix: string; accent: string }) {
  return <div style={{ ...sectionStyle, minHeight: 104, borderTop: `3px solid ${accent}` }}><div style={{ color: colors.muted, fontSize: 12 }}>{label}</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>{value}<small style={{ marginLeft: 5, color: colors.muted, fontSize: 12, fontWeight: 500 }}>{suffix}</small></div></div>
}

function SectionTitle({ title, extra }: { title: string; extra: string }) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', paddingBottom: 10, borderBottom: `1px solid ${colors.line}` }}><h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2><span style={{ color: colors.muted, fontSize: 12 }}>{extra}</span></div> }
function Empty({ text }: { text: string }) { return <p style={{ margin: '18px 0 4px', color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>{text}</p> }
const sectionStyle = { padding: 18, border: `1px solid ${colors.line}`, borderRadius: 10, background: '#fff', boxSizing: 'border-box' as const }
function buttonStyle(primary: boolean) { return { minWidth: 64, height: 34, padding: '0 12px', border: primary ? 0 : `1px solid ${colors.line}`, borderRadius: 7, background: primary ? colors.ink : '#fff', color: primary ? '#fff' : colors.ink, cursor: 'pointer', fontSize: 13 } }
const smallButton = { height: 28, padding: '0 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: colors.blueSoft, color: colors.blue, cursor: 'pointer', fontSize: 12 }

export const inject = ['slots', 'uiWorkspace']

export function apply(ctx: ClientContext): void {
  const Dashboard = (props: FooterProps) => <KaogongDashboard {...props} ctx={ctx} />
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kaogong-dashboard',
    order: 10,
    label: '考公学习看板',
  }, Dashboard))
}
