import { useCallback, useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

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
  weakPoints: { subject: string; knowledgePoint: string; wrongCount: number; errorRate: number }[]
  recentKnowledge: { id: string; title: string; subject: string; knowledgePoint: string; kind: string; content: string; updatedAt: string }[]
}

type FooterProps = PropsRuntime<'sidebar.footer.action'>

const colors = {
  ink: '#202124',
  muted: '#6b7280',
  line: '#e5e7eb',
  blue: '#2563eb',
  blueSoft: '#eff6ff',
  red: '#dc2626',
  green: '#15803d',
}

function pct(value: number): string { return `${Math.round(value * 100)}%` }

function phaseLabel(value: string): string {
  return value === 'sprint' ? '冲刺阶段' : value === 'reinforce' ? '强化阶段' : '基础阶段'
}

function KaogongDashboard({ wide }: FooterProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            {error && <div style={{ ...sectionStyle, color: colors.red, borderColor: '#fecaca', background: '#fff1f2' }}>{error}</div>}
            {data !== null && <>
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <Metric label="距离考试" value={`${data.daysToExam}`} suffix="天" accent={colors.blue} />
                <Metric label="计划完成" value={pct(data.pastDonePct)} suffix={`${data.pastDone}/${data.pastDays} 天`} accent={colors.green} />
                <Metric label="做题正确率" value={pct(data.accuracyRate)} suffix={`${data.totalQuestions} 题`} accent={colors.red} />
                <Metric label="知识库" value={`${data.knowledgeTotal}`} suffix={`讲义/笔记 · 题库 ${data.bankTotal}`} accent="#7c3aed" />
              </section>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: 18, alignItems: 'start' }}>
                <section style={sectionStyle}>
                  <SectionTitle title="今日计划" extra={`${phaseLabel(data.todayPlan.phase)} · ${data.today}`} />
                  {data.todayPlan.items.length === 0 && <Empty text="今天暂无计划，请在对话中说“帮我生成学习计划”。" />}
                  {data.todayPlan.items.map((item, index) => <label key={`${item.subject}-${item.title}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 0', borderBottom: index === data.todayPlan.items.length - 1 ? 0 : `1px solid ${colors.line}`, cursor: 'pointer' }}>
                    <input type="checkbox" checked={item.done} onChange={event => { void toggleItem(index, event.target.checked) }} style={{ marginTop: 3, accentColor: colors.blue }} />
                    <span style={{ flex: 1, minWidth: 0, textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? .55 : 1 }}><strong style={{ display: 'block', fontSize: 14 }}>{item.title}</strong><small style={{ color: colors.muted }}>{item.subject} · {item.kind}</small></span>
                  </label>)}
                </section>
                <section style={sectionStyle}>
                  <SectionTitle title="薄弱考点" extra="按错题聚合" />
                  {data.weakPoints.length === 0 && <Empty text="还没有错题记录，完成练习后这里会自动生成。" />}
                  {data.weakPoints.map(point => <div key={`${point.subject}-${point.knowledgePoint}`} style={{ padding: '11px 0', borderBottom: `1px solid ${colors.line}` }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><strong>{point.knowledgePoint}</strong><span style={{ color: colors.red }}>{point.wrongCount} 错</span></div><div style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>{point.subject} · 错误率 {pct(point.errorRate)}</div><div style={{ height: 5, marginTop: 8, borderRadius: 99, background: '#fee2e2' }}><div style={{ width: `${Math.min(100, point.errorRate * 100)}%`, height: '100%', borderRadius: 99, background: colors.red }} /></div></div>)}
                </section>
              </div>
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

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kaogong-dashboard',
    order: 10,
    label: '考公学习看板',
  }, KaogongDashboard))
}
