/**
 * 讲义与检测题共用的可复算数据。
 *
 * 内容里手写的题干、选项和解析容易和算术脱节；这里把「按什么加权、排除了哪些选项」
 * 变成数据，由纯函数核对，测试就能断言不变量而不是某句文案。
 */

export type MixedPart = { base: number; rate: number }

export type IntervalCheck = {
  kind: 'interval'
  /** 各部分的基期量与增长率；整体增长率按基期量加权。 */
  parts: readonly MixedPart[]
  /** 用区间理由排除的选项下标：必须严格落在两个部分率之外。 */
  cut: readonly number[]
  /** 答案是否为区间内唯一选项（只靠区间就能定案）。 */
  uniqueInside?: boolean
}

export type CrossCheck = {
  kind: 'cross'
  /** 两部分增长率与整体增长率。 */
  aRate: number
  bRate: number
  overallRate: number
  /** 两部分基期量之比 A∶B；必须与十字交叉结果一致。 */
  ratio: number
}

export type AnswerCheck = IntervalCheck | CrossCheck

const EPSILON = 1e-9

/** 基期量加权平均。 */
export function mixedRate(parts: readonly MixedPart[]): number {
  const total = parts.reduce((sum, part) => sum + part.base, 0)
  if (total <= 0) return 0
  return parts.reduce((sum, part) => sum + part.base * part.rate, 0) / total
}

/** 已知现期量与增长率时，先还原基期量再加权：现期比例不能直接当权重。 */
export function mixedRateFromCurrent(parts: readonly { current: number; rate: number }[]): number {
  return mixedRate(parts.map(part => ({ base: part.current / (1 + part.rate / 100), rate: part.rate })))
}

/** 十字交叉：两部分基期量之比 A∶B = |b − r| ∶ |r − a|。 */
export function crossRatio(aRate: number, bRate: number, overallRate: number): number {
  return Math.abs(bRate - overallRate) / Math.abs(overallRate - aRate)
}

/** 增长量 = 现期量 × 增长率 ÷ (1 + 增长率)。 */
export function growthAmount(current: number, rate: number): number {
  return current * rate / (100 + rate)
}

function percentOrNull(option: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)\s*%/.exec(option)
  return match ? Number(match[1]) : null
}

function ratioOrNull(option: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*[∶:]\s*(\d+(?:\.\d+)?)/.exec(option)
  return match ? Number(match[1]) / Number(match[2]) : null
}

/** 严格读取百分数选项；格式不对就抛错，避免静默按 0 处理。 */
export function optionPercent(option: string): number {
  const value = percentOrNull(option)
  if (value === null) throw new Error(`选项不是百分数：${option}`)
  return value
}

/** 严格读取 a∶b 形式的比例选项。 */
export function optionRatio(option: string): number {
  const value = ratioOrNull(option)
  if (value === null) throw new Error(`选项不是比例：${option}`)
  return value
}

function auditInterval(options: readonly string[], answer: number, check: IntervalCheck): string[] {
  const problems: string[] = []
  if (check.parts.length < 2) problems.push('区间检查至少需要两个部分')
  if (check.parts.length === 0) return problems

  const rates = check.parts.map(part => part.rate)
  const lower = Math.min(...rates)
  const upper = Math.max(...rates)
  if (!(lower < upper)) {
    problems.push(`两个部分率相同（${lower}%），区间退化成点`)
    return problems
  }

  const exact = mixedRate(check.parts)
  if (!(exact > lower && exact < upper)) {
    problems.push(`加权结果 ${exact.toFixed(4)}% 不在区间 (${lower}%, ${upper}%) 内`)
  }

  const values = options.map(percentOrNull)
  const badOption = values.findIndex(value => value === null)
  if (badOption >= 0) {
    problems.push(`选项不是百分数：${options[badOption]}`)
    return problems
  }
  const numeric = values as number[]

  const chosen = numeric[answer]
  if (!(chosen > lower && chosen < upper)) {
    problems.push(`答案 ${options[answer]} 不在区间 (${lower}%, ${upper}%) 内`)
  }

  const nearest = numeric.reduce(
    (best, value, index) => Math.abs(value - exact) < Math.abs(numeric[best] - exact) - EPSILON ? index : best,
    0,
  )
  if (nearest !== answer) {
    problems.push(`答案 ${options[answer]} 不是离精确值 ${exact.toFixed(4)}% 最近的选项（更近的是 ${options[nearest]}）`)
  }

  for (const index of check.cut) {
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      problems.push(`排除下标越界：${index}`)
      continue
    }
    if (index === answer) problems.push('答案被列进了区间排除项')
    const value = numeric[index]
    if (value > lower && value < upper) {
      problems.push(`被区间排除的 ${options[index]} 其实在区间 (${lower}%, ${upper}%) 内`)
    } else if (value === lower || value === upper) {
      problems.push(`被区间排除的 ${options[index]} 落在端点上，不算区间外`)
    }
  }

  if (check.uniqueInside) {
    const inside = numeric.filter(value => value > lower && value < upper)
    if (inside.length !== 1) problems.push(`区间内应只剩一个选项，实际 ${inside.length} 个`)
  }
  return problems
}

function auditCross(options: readonly string[], answer: number, check: CrossCheck): string[] {
  const problems: string[] = []
  const lower = Math.min(check.aRate, check.bRate)
  const upper = Math.max(check.aRate, check.bRate)
  if (!(check.overallRate > lower && check.overallRate < upper)) {
    problems.push(`整体增长率 ${check.overallRate}% 不在两个部分率之间`)
  }

  const expected = crossRatio(check.aRate, check.bRate, check.overallRate)
  if (!Number.isFinite(expected) || Math.abs(expected - check.ratio) > EPSILON) {
    problems.push(`十字交叉结果 ${expected} 与题设比例 ${check.ratio} 不一致`)
  }

  const values = options.map(ratioOrNull)
  const badOption = values.findIndex(value => value === null)
  if (badOption >= 0) {
    problems.push(`选项不是比例：${options[badOption]}`)
    return problems
  }
  const numeric = values as number[]

  if (Math.abs(numeric[answer] - expected) > EPSILON) {
    problems.push(`答案 ${options[answer]} 不等于十字交叉结果 ${expected}`)
  }
  const matches = numeric.filter(value => Math.abs(value - expected) <= EPSILON).length
  if (matches !== 1) problems.push(`十字交叉结果应对应唯一选项，实际 ${matches} 个`)
  return problems
}

/** 核对答案下标、选项集合与排除理由；返回空数组表示这题可复算。 */
export function auditAnswer(options: readonly string[], answer: number, check: AnswerCheck): string[] {
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    return [`答案下标越界：${answer}`]
  }
  const problems: string[] = []
  if (new Set(options).size !== options.length) problems.push('选项有重复')
  if (check.kind === 'cross') return [...problems, ...auditCross(options, answer, check)]
  return [...problems, ...auditInterval(options, answer, check)]
}
