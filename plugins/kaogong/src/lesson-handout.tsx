import { useState } from 'react'

/** 讲义是数据：渲染器只认结构，不认某一课的文字。 */
export type HandoutStep = { label: string; text: string }

export type LabValues = { aBase: number; bBase: number; aRate: number; bRate: number }

export type LabPreset = LabValues & { label: string }

/** 实验台同样只认结构：两部分的名字、取值范围、初值与预设都由数据给。 */
export type LabBlock = {
  kind: 'lab'
  title: string
  hint: string
  labels: { a: string; b: string }
  baseLimit: { min: number; max: number; step: number }
  rateLimit: { min: number; max: number; step: number }
  initial: LabValues
  presets: LabPreset[]
}

export type HandoutBlock =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'formula'; text: string }
  | { kind: 'callout'; label: string; text: string }
  | LabBlock
  | { kind: 'example'; no: string; tag: string; seconds: string; question: string; options: string[]; answer: number; steps: HandoutStep[]; slow?: string }

/** 小节编号可为空：独立小节（如「动手试一试」）不编号，渲染成「＋ 标题」。 */
export type HandoutSection = { id: string; no?: string; title: string; blocks: HandoutBlock[] }

export type Handout = {
  id: string
  subject: string
  title: string
  goal: string
  /** 内容来源说明：自编还是真题。自编必须写明，不冒充真题。 */
  provenance: string
  sections: HandoutSection[]
}

export type LabCalculation = {
  /** 以基期量为权重算出的整体增长率。 */
  overallRate: number
  /** 若错把现期量当权重，会算出的整体增长率。 */
  currentWeightRate: number
  /** 现期权重结果 − 基期权重结果（百分点）。 */
  weightGap: number
  lower: number
  upper: number
  lean: 'a' | 'b' | 'equal' | 'same-rate'
  distanceToA: number
  distanceToB: number
}

/** 纯计算：整体增长率、偏向判定、现期权重对照。 */
export function labCalculation(values: LabValues): LabCalculation {
  const totalBase = values.aBase + values.bBase
  const overallRate = totalBase > 0
    ? (values.aBase * values.aRate + values.bBase * values.bRate) / totalBase
    : (values.aRate + values.bRate) / 2
  const aCurrent = values.aBase * (1 + values.aRate / 100)
  const bCurrent = values.bBase * (1 + values.bRate / 100)
  const totalCurrent = aCurrent + bCurrent
  const currentWeightRate = totalCurrent > 0
    ? (aCurrent * values.aRate + bCurrent * values.bRate) / totalCurrent
    : overallRate
  const lean = values.aRate === values.bRate
    ? 'same-rate' as const
    : values.aBase === values.bBase
      ? 'equal' as const
      : values.aBase > values.bBase ? 'a' as const : 'b' as const
  return {
    overallRate,
    currentWeightRate,
    weightGap: currentWeightRate - overallRate,
    lower: Math.min(values.aRate, values.bRate),
    upper: Math.max(values.aRate, values.bRate),
    lean,
    distanceToA: Math.abs(overallRate - values.aRate),
    distanceToB: Math.abs(overallRate - values.bRate),
  }
}

/** 有编号就显示「02 标题」，独立小节显示「＋ 标题」。 */
function sectionHeading(section: HandoutSection): string {
  return section.no ? `${section.no} ${section.title}` : `＋ ${section.title}`
}

export const MIXED_GROWTH_HANDOUT: Handout = {
  id: 'mixed-growth',
  subject: '行测-资料分析',
  title: '混合增长率',
  goal: '看到「其中…合计」能判型，用区间 + 偏向在 20 秒内排掉两个选项。',
  provenance: '自编讲义：例题为教学设计用，非真题；真题在练习轮次里。',
  sections: [
    {
      id: 'handout-s1', no: '01', title: '一句话结论',
      blocks: [
        { kind: 'callout', label: '记住这一句', text: '整体的增长率是两个部分增长率的加权平均，权重是基期量，不是现期量。' },
        { kind: 'p', text: '从这句话直接得到两个动作：' },
        { kind: 'bullets', items: ['整体增长率一定落在两个部分增长率之间 —— 用来砍选项。', '它更靠近基期量大的那一侧 —— 用来二选一。'] },
      ],
    },
    {
      id: 'handout-s2', no: '02', title: '为什么是这样',
      blocks: [
        { kind: 'p', text: '设两部分基期量 A基、B基，增长率 a、b。整体基期 = A基 + B基，整体现期 = A基(1+a) + B基(1+b)。' },
        { kind: 'formula', text: 'r = (A基 · a + B基 · b) ÷ (A基 + B基)' },
        { kind: 'p', text: '右边就是一个加权平均：夹在两个数中间，被权重大的那个拉过去。把它反过来解，就是十字交叉。' },
        { kind: 'formula', text: 'A基 : B基 = |b − r| : |r − a|' },
        { kind: 'p', text: '交叉相减，得到的是对面的权重。这一步很多人背反，快 3 专门练。' },
      ],
    },
    {
      id: 'handout-lab', title: '动手试一试',
      blocks: [
        {
          kind: 'lab',
          title: '混合增长率实验台',
          hint: '拖动两部分的基期量与增长率，看整体增长率落在区间里的位置、偏向哪一侧。可以再拖动滑杆换一组数，猜过的位置仍留在数轴上。',
          labels: { a: 'A', b: 'B' },
          baseLimit: { min: 100, max: 1000, step: 10 },
          rateLimit: { min: 0, max: 30, step: 0.1 },
          initial: { aBase: 800, bBase: 200, aRate: 9.2, bRate: 4.6 },
          presets: [
            { label: '回到例题', aBase: 800, bBase: 200, aRate: 9.2, bRate: 4.6 },
            { label: '两边一样大', aBase: 500, bBase: 500, aRate: 9.2, bRate: 4.6 },
            { label: 'A 是 B 的 9 倍', aBase: 900, bBase: 100, aRate: 9.2, bRate: 4.6 },
            { label: '把两个率拉开', aBase: 800, bBase: 400, aRate: 20, bRate: 0 },
          ],
        },
      ],
    },
    {
      id: 'handout-s3', no: '03', title: '怎么认出来',
      blocks: [
        { kind: 'bullets', items: ['「其中 A 增长 x%，B 增长 y%，合计 / 全市 / 全省增长多少」。', '给了整体和一个部分，反过来求另一个部分，或求两部分的比例。', '同时出现「占比」和「增长」—— 先分清混的是率还是比重。'] },
        { kind: 'p', text: '反过来：只有一个整体、没有拆分，就不是混合，别硬套。' },
      ],
    },
    {
      id: 'handout-s4', no: '04', title: '标准思路',
      blocks: [
        { kind: 'bullets', items: ['定对象：写出「整体 = A + B」，写不出就是判型没做对。', '定权重：增长率用基期量；比重用现期量。', '列式：r =（A基·a + B基·b）÷（A基 + B基）。', '算：截位直除，保留两位有效数字。'] },
        { kind: 'p', text: '它的价值是准、能验算；缺点是慢，40 秒起步。下面四道示范里每道都附了一行「慢解」—— 你会看到同一个答案要花多少时间。' },
      ],
    },
    {
      id: 'handout-s5', no: '05', title: '快速思路',
      blocks: [
        { kind: 'bullets', items: ['定区间：答案在两个部分率之间，区间外的直接划掉。5 秒，通常砍掉 2 个。', '定偏向：看谁的基期量大，答案就往那边靠；先看在中点哪一侧，再挑更靠的那一个。', '只剩两个同侧选项，才动十字交叉。'] },
        {
          kind: 'example', no: '快 1', tag: '只用区间，一个数都不用算', seconds: '3 秒',
          question: '2023 年某省高技术产业增加值增长 13.5%，传统产业增长 5.2%，两者合计增长约为：',
          options: ['4.7%', '9.1%', '13.5%', '15.8%'], answer: 1,
          steps: [
            { label: '定区间', text: '5.2% – 13.5%，答案必在里头。' },
            { label: '砍选项', text: '4.7 比下界还低；13.5 恰好等于其中一个部分值（混合不可能等于部分值）；15.8 比上界还高。三个一起出局。' },
            { label: '结论', text: 'B，9.1%。这类题占混合增长率的六成以上。' },
          ],
        },
        {
          kind: 'example', no: '快 2', tag: '区间砍两个，偏向定一个', seconds: '12 秒',
          question: '2022 年某市 A 类车销量 60 万辆、B 类 15 万辆；2023 年 A 类增长 12%，B 类增长 3%。两类合计增速约为：',
          options: ['3.5%', '7.2%', '10.2%', '12.5%'], answer: 2,
          steps: [
            { label: '定区间', text: '3% – 12%。3.5 太低、12.5 太高，先出局。' },
            { label: '偏向', text: 'A 是 B 的 4 倍，权重 4∶1，答案要明显贴 12%。中点 7.5%：7.2 在中点左边，10.2 在中点右边、且离 12% 只差一点八个点。' },
            { label: '结论', text: 'C，10.2%。' },
          ],
          slow: '(60×12 + 15×3) ÷ 75 = 10.2%，40 秒。同一个答案，快解用了三分之一时间。',
        },
        {
          kind: 'example', no: '快 3', tag: '问的是比例，才需要十字交叉', seconds: '25 秒',
          question: '某公司上半年营收增长 8%，下半年增长 2%，全年增长 6%。上半年与下半年基期营收之比为：',
          options: ['1∶1', '2∶1', '1∶2', '3∶1'], answer: 1,
          steps: [
            { label: '判型', text: '这次问的不是「增长多少」，是「两部分的比例」—— 区间和偏向都用不上，直接十字交叉。' },
            { label: '交叉', text: '上半年∶下半年 = |2 − 6| ∶ |6 − 8| = 4 ∶ 2 = 2∶1。' },
            { label: '结论', text: 'B。验算：(2×8% + 1×2%) ÷ 3 = 6%，对。' },
          ],
          slow: '设上半年 x、下半年 y，解 8x + 2y = 6(x+y) → 2x = 4y → 2∶1，60 秒。',
        },
        {
          kind: 'example', no: '快 4', tag: '快速思路在这里失效', seconds: '40 秒',
          question: '2022 年某市 A 类企业营收 200 亿元、B 类 100 亿元；2023 年 A 类增长 7.2%，B 类增长 6.8%。两类合计增速约为：',
          options: ['6.9%', '7.05%', '7.15%', '7.3%'], answer: 1,
          steps: [
            { label: '定区间', text: '6.8% – 7.2%，只够砍掉 6.9 和 7.3。区间太窄，排除力没了。' },
            { label: '偏向', text: 'A 是 B 的 2 倍，答案在中点 7.0% 右边 —— 7.05 和 7.15 都在右边，估不出来。' },
            { label: '转精算', text: '从 7.2% 往下拉三分之一差距：7.2 − 0.4×(1/3) = 7.07%。' },
            { label: '结论', text: 'B。这题就该慢 —— 两个部分率只差 0.4 个点，任何估算都是猜。' },
          ],
        },
        { kind: 'callout', label: '边界', text: '两个部分率很接近（差 1–2 个点），或两个选项都在正确一侧且离得近，就别估，老实写十字交叉。快是为了准，不是为了快。' },
      ],
    },
    {
      id: 'handout-s6', no: '06', title: '三个陷阱',
      blocks: [
        { kind: 'p', text: '一、权重用成现期量。这是混合增长率里最贵的错，算出来的数看着还挺合理，所以很难自己发现。当堂检测第 3 题专门设了这个坑。' },
        { kind: 'p', text: '二、增长率混基期，比重混现期。增长率混的是去年的量，比重混的是今年的量。' },
        { kind: 'p', text: '三、百分点不是增长率。「提高 2 个百分点」是比重的变化，是个减法结果，不能拿去和增长率加权平均。' },
      ],
    },
  ],
}

/** 第 2 课：同样只提供数据；渲染、目录、回跳都用上面那套结构。 */
export const GROWTH_COMPARISON_HANDOUT: Handout = {
  id: 'growth-comparison',
  subject: '行测-资料分析',
  title: '增长量比较',
  goal: '看到「增长最多 / 最少」先看现期量与增长率，两个快解在 20 秒内定答案。',
  provenance: '自编讲义：例题为教学设计用，非真题。',
  sections: [
    {
      id: 'handout2-s1', no: '01', title: '一句话结论',
      blocks: [
        { kind: 'callout', label: '记住这一句', text: '增长量比较别硬算，先看现期量与增长率；两者都大就必胜，一增一减再动笔。' },
        { kind: 'p', text: '增长量 = 基期量 × 增长率 = 现期量 × 增长率 ÷ (1 + 增长率)。比较时先看两边的现期量和增长率，能不动笔就不动笔。' },
      ],
    },
    {
      id: 'handout2-s2', no: '02', title: '两个快解',
      blocks: [
        { kind: 'bullets', items: ['两者都大则必大：现期量大、增长率也大的一方，增长量一定更大，直接选。', '一增一减用公式估：现期量与增长率一大一小时，用 现期 × 增长率 ÷ (1 + 增长率) 约算，保留两位有效数字即可。'] },
        { kind: 'p', text: '例：甲现期 100、增长 20%；乙现期 200、增长 10%。乙的增长率低，但现期量是甲的两倍，属于一增一减，要估。' },
        { kind: 'formula', text: '甲 ≈ 100 × 20% ÷ 1.2 ≈ 16.7；乙 = 200 × 10% ÷ 1.1 ≈ 18.2' },
        { kind: 'p', text: '所以乙的增长量更大：增长率低的一方也能赢，关键看现期量。' },
      ],
    },
    {
      id: 'handout2-s3', no: '03', title: '一个陷阱',
      blocks: [
        { kind: 'callout', label: '别踩', text: '增长率高不等于增长量大，还要看现期量（或基期量）。' },
        { kind: 'p', text: '上场先问自己：两边的现期量差多少？只拿增长率比大小，是把「跑得快」当成了「跑得远」。' },
      ],
    },
  ],
}

export function HandoutView({ handout }: { handout: Handout }) {
  const [fastOnly, setFastOnly] = useState(false)
  return (
    <article aria-label="课堂讲义" style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <strong>{handout.title}</strong>
        <span style={{ color: '#475467' }}>目标：{handout.goal}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <small style={{ color: '#667085' }}>{handout.provenance}</small>
          <button data-pwb-button type="button" aria-pressed={fastOnly} onClick={() => setFastOnly(value => !value)}>
            {fastOnly ? '显示慢解' : '只看快速思路'}
          </button>
        </span>
      </header>
      <nav aria-label="讲义目录" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
        {handout.sections.map(section => <a key={section.id} href={'#' + section.id}>{sectionHeading(section)}</a>)}
      </nav>
      {handout.sections.map(section => (
        <section key={section.id} id={section.id} aria-label={section.title} style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>{sectionHeading(section)}</h3>
          {section.blocks.map((block, index) => <BlockView key={index} block={block} fastOnly={fastOnly} />)}
        </section>
      ))}
    </article>
  )
}

function BlockView({ block, fastOnly }: { block: HandoutBlock; fastOnly: boolean }) {
  if (block.kind === 'p') return <p style={{ margin: 0, lineHeight: 1.8 }}>{block.text}</p>
  if (block.kind === 'bullets') return <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  if (block.kind === 'formula') return <code style={{ display: 'block', background: '#f4f6f1', border: '1px solid #dbe2d8', borderRadius: 6, padding: '6px 10px', fontFamily: 'ui-monospace, Consolas, monospace' }}>{block.text}</code>
  if (block.kind === 'callout') return <div style={{ background: '#f4f8f4', borderLeft: '3px solid #2f6b58', borderRadius: '0 6px 6px 0', padding: '8px 12px' }}><b>{block.label}　</b>{block.text}</div>
  if (block.kind === 'lab') return <LabBench block={block} />
  return (
    <div style={{ border: '1px solid #dbe2d8', borderRadius: 8, padding: 10, display: 'grid', gap: 6, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <b>{block.no}</b><span style={{ color: '#475467' }}>{block.tag}</span>
        <small style={{ marginLeft: 'auto', color: '#667085' }}>{block.seconds}</small>
      </div>
      <p style={{ margin: 0, lineHeight: 1.7 }}>{block.question}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {block.options.map((option, index) => (
          <span key={index} style={{ fontWeight: index === block.answer ? 700 : 400 }}>{'ABCD'[index]}. {option}</span>
        ))}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
        {block.steps.map((step, index) => <li key={index}><b>{step.label}</b>　{step.text}</li>)}
        {block.slow && !fastOnly && <li style={{ color: '#667085' }}><b>慢解</b>　{block.slow}</li>}
      </ul>
    </div>
  )
}

function LabSlider({ label, value, text, min, max, step, onChange }: { label: string; value: number; text: string; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 12, color: '#475467' }}>{label} <b style={{ color: '#1f2420' }}>{text}</b></span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onInput={event => onChange(Number(event.currentTarget.value))} />
    </label>
  )
}

function LabBench({ block }: { block: LabBlock }) {
  const [values, setValues] = useState<LabValues>(block.initial)
  const [revealed, setRevealed] = useState(true)
  const [guess, setGuess] = useState<number | null>(null)
  const calc = labCalculation(values)
  const { a, b } = block.labels

  const change = (patch: Partial<LabValues>) => {
    // 拖动滑杆只改参数，不清空猜过的位置：换一组数还能对照原来的判断。
    setValues(current => ({ ...current, ...patch }))
  }
  const applyPreset = (preset: LabPreset) => change({ aBase: preset.aBase, bBase: preset.bBase, aRate: preset.aRate, bRate: preset.bRate })
  const position = (rate: number) => calc.upper === calc.lower ? 50 : ((rate - calc.lower) / (calc.upper - calc.lower)) * 100
  const leanText = calc.lean === 'equal' ? '正中间（两边一样重）'
    : calc.lean === 'same-rate' ? '两个部分率相同，区间退成一个点'
      : `偏向 ${calc.lean === 'a' ? a : b}`
  const distanceText = calc.lean === 'same-rate' ? ''
    : calc.lean === 'equal' ? `　距两侧各 ${calc.distanceToA.toFixed(1)} 个点`
      : `　距 ${a} ${calc.distanceToA.toFixed(1)} 个点 · 距 ${b} ${calc.distanceToB.toFixed(1)} 个点`

  return (
    <div style={{ border: '1px solid #dbe2d8', borderRadius: 8, padding: 12, display: 'grid', gap: 10, background: '#fbfcf9' }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <b>{block.title}</b>
        <small style={{ color: '#667085' }}>{block.hint}</small>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 14px' }}>
        <LabSlider label={`${a} 基期量`} value={values.aBase} text={String(values.aBase)} min={block.baseLimit.min} max={block.baseLimit.max} step={block.baseLimit.step} onChange={value => change({ aBase: value })} />
        <LabSlider label={`${b} 基期量`} value={values.bBase} text={String(values.bBase)} min={block.baseLimit.min} max={block.baseLimit.max} step={block.baseLimit.step} onChange={value => change({ bBase: value })} />
        <LabSlider label={`${a} 增长率`} value={values.aRate} text={`${values.aRate.toFixed(1)}%`} min={block.rateLimit.min} max={block.rateLimit.max} step={block.rateLimit.step} onChange={value => change({ aRate: value })} />
        <LabSlider label={`${b} 增长率`} value={values.bRate} text={`${values.bRate.toFixed(1)}%`} min={block.rateLimit.min} max={block.rateLimit.max} step={block.rateLimit.step} onChange={value => change({ bRate: value })} />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="在数轴上点选猜测"
        aria-disabled={revealed}
        onClick={event => {
          if (revealed) return
          const rect = event.currentTarget.getBoundingClientRect()
          const span = calc.upper - calc.lower
          const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0.5
          setGuess(Math.round((calc.lower + span * ratio) * 100) / 100)
        }}
        onKeyDown={event => {
          if (revealed || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          setGuess(Math.round(((calc.lower + calc.upper) / 2) * 100) / 100)
        }}
        style={{ position: 'relative', height: 54, cursor: revealed ? 'default' : 'crosshair', outline: 'none', touchAction: 'none' }}
      >
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 23, height: 8, borderRadius: 999, background: '#e5e9e2' }} />
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 19, width: 2, height: 16, background: '#98a29a' }} />
        <div aria-hidden style={{ position: 'absolute', right: 0, top: 19, width: 2, height: 16, background: '#98a29a' }} />
        {revealed && (
          <div aria-hidden title="整体增长率" style={{ position: 'absolute', top: 20, left: `${position(calc.overallRate)}%`, width: 14, height: 14, marginLeft: -7, borderRadius: '50%', background: '#2f6b58', border: '2px solid #fff', boxShadow: '0 0 0 1px #2f6b58' }} />
        )}
        {guess !== null && (
          <div aria-hidden title="你的猜测" style={{ position: 'absolute', top: 21, left: `${position(guess)}%`, width: 12, height: 12, marginLeft: -6, borderRadius: 2, background: '#b8892f', boxShadow: '0 0 0 1px #b8892f' }} />
        )}
        <span style={{ position: 'absolute', left: 0, top: 36, fontSize: 11, color: '#667085' }}>{calc.lower.toFixed(1)}%</span>
        <span style={{ position: 'absolute', right: 0, top: 36, fontSize: 11, color: '#667085' }}>{calc.upper.toFixed(1)}%</span>
      </div>

      <p role="status" style={{ margin: 0, lineHeight: 1.7, fontWeight: 600 }}>
        {revealed
          ? `整体增长率 ${calc.overallRate.toFixed(2)}%　${leanText}${distanceText}`
          : guess === null
            ? '结果已藏起：在数轴上点一个位置猜一猜，或直接揭晓答案。'
            : `结果已藏起　你的猜测 ${guess.toFixed(2)}%　点「揭晓答案」对照。`}
      </p>
      <div style={{ fontSize: 12, color: '#475467' }}>
        {revealed
          ? `基期当权重 ${calc.overallRate.toFixed(2)}%　现期当权重 ${calc.currentWeightRate.toFixed(2)}%　差 ${Math.abs(calc.weightGap).toFixed(2)} 个百分点`
          : '基期当权重 ——　现期当权重 ——　差 ——（揭晓后显示）'}
      </div>
      {revealed && guess !== null && (
        <div style={{ fontSize: 12, color: '#475467' }}>你的猜测 {guess.toFixed(2)}%，实际 {calc.overallRate.toFixed(2)}%，误差 {Math.abs(guess - calc.overallRate).toFixed(2)} 个百分点。</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <button data-pwb-button type="button" onClick={() => {
          if (!revealed) { setRevealed(true); return }
          setGuess(null)
          setRevealed(false)
        }}>{!revealed ? '揭晓答案' : guess !== null ? '再猜一次' : '先猜再看'}</button>
        <small style={{ color: '#667085' }}>先猜再看：藏起结果，在数轴上点一下猜位置。</small>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <small style={{ color: '#667085' }}>预设</small>
        {block.presets.map(preset => <button key={preset.label} data-pwb-button type="button" onClick={() => applyPreset(preset)}>{preset.label}</button>)}
      </div>
    </div>
  )
}
