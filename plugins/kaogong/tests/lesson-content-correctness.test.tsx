import test from 'node:test'
import assert from 'node:assert/strict'
import { GROWTH_COMPARISON_HANDOUT, MIXED_GROWTH_HANDOUT, auditExample } from '../src/lesson-handout.tsx'
import type { ExampleBlock, Handout, HandoutBlock } from '../src/lesson-handout.tsx'
import { GROWTH_COMPARISON_QUIZ, MIXED_GROWTH_QUIZ } from '../src/lesson-quiz.tsx'
import { LESSON_CONTENTS, resolveLessonContent } from '../src/lesson-content.ts'
import {
  crossRatio,
  growthAmount,
  mixedRate,
  mixedRateFromCurrent,
  optionPercent,
  optionRatio,
} from '../src/lesson-content-check.ts'

const examplesOf = (handout: Handout): ExampleBlock[] =>
  handout.sections.flatMap(section => section.blocks).filter((block): block is ExampleBlock => block.kind === 'example')

const textOf = (block: HandoutBlock): string => {
  if (block.kind === 'p' || block.kind === 'formula') return block.text
  if (block.kind === 'bullets') return block.items.join('\n')
  if (block.kind === 'callout') return `${block.label}\n${block.text}`
  if (block.kind === 'lab') return [block.title, block.hint, ...block.presets.map(preset => preset.label)].join('\n')
  return [block.no, block.tag, block.effort, block.question, ...block.options, ...block.steps.flatMap(step => [step.label, step.text]), block.slow ?? ''].join('\n')
}

test('每个例题都能通过可复算审计：排除项在区间外、答案离精确值最近', () => {
  for (const handout of [MIXED_GROWTH_HANDOUT, GROWTH_COMPARISON_HANDOUT]) {
    const examples = examplesOf(handout)
    if (handout.id === 'mixed-growth') assert.ok(examples.length > 0, `${handout.title} 应有例题`)
    for (const example of examples) {
      assert.deepEqual(auditExample(example), [], `${handout.title} ${example.no} 审计失败`)
      assert.equal('seconds' in example, false, `${example.no} 不应再保留没有依据的耗时字段`)
    }
  }
})

test('区间排除不变量：每个被排除的选项都严格落在区间外', () => {
  const intervals = examplesOf(MIXED_GROWTH_HANDOUT).filter(example => example.check.kind === 'interval')
  assert.equal(intervals.length, 3, '第 1 课应有三个用区间的例题')
  for (const example of intervals) {
    if (example.check.kind !== 'interval') continue
    const rates = example.check.parts.map(part => part.rate)
    const lower = Math.min(...rates)
    const upper = Math.max(...rates)
    const values = example.options.map(optionPercent)
    assert.ok(example.check.cut.length > 0, `${example.no} 应至少排除一个选项`)
    for (const index of example.check.cut) {
      assert.ok(
        values[index] < lower || values[index] > upper,
        `${example.no} 的排除项 ${example.options[index]} 落在区间 [${lower}, ${upper}] 内`,
      )
    }
    assert.ok(
      values[example.answer] > lower && values[example.answer] < upper,
      `${example.no} 的答案 ${example.options[example.answer]} 应严格在区间内`,
    )
  }
})

test('审计器能抓住区间内的排除项和区间外的答案，不是空转', () => {
  const fast2 = examplesOf(MIXED_GROWTH_HANDOUT).find(item => item.no === '快 2')
  assert.ok(fast2)
  if (fast2.check.kind !== 'interval') throw new Error('快 2 应使用区间检查')

  const insideCut = { ...fast2, check: { ...fast2.check, cut: [1] } }
  assert.ok(
    auditExample(insideCut).some(problem => problem.includes('其实在区间')),
    '把区间内的 7.2% 列为排除项时，审计必须报错',
  )

  const outsideAnswer = { ...fast2, answer: 0 }
  assert.ok(auditExample(outsideAnswer).length > 0, '答案落在区间外时，审计必须报错')
})

test('四个例题的答案按题干数据独立复算', () => {
  const example = (no: string) => {
    const found = examplesOf(MIXED_GROWTH_HANDOUT).find(item => item.no === no)
    assert.ok(found, `找不到例题 ${no}`)
    return found
  }

  const fast1 = example('快 1')
  assert.equal(fast1.check.kind, 'interval')
  if (fast1.check.kind === 'interval') {
    assert.equal(mixedRate(fast1.check.parts).toFixed(2), '10.18')
    assert.equal(optionPercent(fast1.options[fast1.answer]), 10.2)
  }

  const fast2 = example('快 2')
  assert.equal(fast2.check.kind, 'interval')
  if (fast2.check.kind === 'interval') {
    assert.equal(mixedRate(fast2.check.parts).toFixed(1), '10.2')
    assert.equal(optionPercent(fast2.options[fast2.answer]), 10.2)
  }

  const fast3 = example('快 3')
  assert.equal(fast3.check.kind, 'cross')
  if (fast3.check.kind === 'cross') {
    assert.equal(crossRatio(fast3.check.aRate, fast3.check.bRate, fast3.check.overallRate), 2)
    assert.equal(optionRatio(fast3.options[fast3.answer]), 2)
    assert.equal(mixedRate([{base: 2, rate: 8}, {base: 1, rate: 2}]).toFixed(1), '6.0')
  }

  const fast4 = example('快 4')
  assert.equal(fast4.check.kind, 'interval')
  if (fast4.check.kind === 'interval') {
    assert.equal(mixedRate(fast4.check.parts).toFixed(2), '7.05')
    assert.equal(optionPercent(fast4.options[fast4.answer]), 7.05)
  }
})

test('第 1 课检测第 1 题：补上人口条件后按收入总量加权可复算', () => {
  const question = MIXED_GROWTH_QUIZ[0]
  assert.match(question.prompt, /城镇与农村人口各 500 万/, '题目必须给出人口条件，人均收入不能直接当权重')
  assert.equal(mixedRate([{base: 500 * 4.2, rate: 5.8}, {base: 500 * 1.8, rate: 8.4}]).toFixed(2), '6.58')

  const values = question.options.map(optionPercent)
  assert.equal(question.answer, 1)
  assert.equal(values[question.answer], 6.6)
  assert.ok(values[0] < 5.8, '5.4% 应低于下界')
  assert.ok(values[3] > 8.4, '9.1% 应高于上界')
  assert.ok(values[2] > 5.8 && values[2] < 8.4, '7.8% 在区间内，必须靠权重排除')
  assert.ok(
    Math.abs(values[2] - 6.58) > Math.abs(values[1] - 6.58),
    '7.8% 应比 6.6% 离精确值更远',
  )
})

test('第 1 课检测第 2、3 题：十字交叉与现期权重陷阱都可复算', () => {
  const cross = MIXED_GROWTH_QUIZ[1]
  assert.equal(cross.answer, 0)
  assert.equal(crossRatio(10, 4, 6), 0.5)
  assert.equal(optionRatio(cross.options[cross.answer]), 0.5)

  const weightTrap = MIXED_GROWTH_QUIZ[2]
  assert.equal(weightTrap.answer, 1)
  assert.equal(mixedRateFromCurrent([{current: 2, rate: 20}, {current: 1, rate: 0}]).toFixed(1), '12.5')
  assert.equal(optionPercent(weightTrap.options[weightTrap.answer]), 12.5)
  assert.equal(mixedRate([{base: 2, rate: 20}, {base: 1, rate: 0}]).toFixed(1), '13.3', '把现期当权重会算成 13.3%')
})

test('第 2 课检测三题：增长量公式与“增长率高不等于增长量大”都可复算', () => {
  const compare = GROWTH_COMPARISON_QUIZ[0]
  assert.equal(growthAmount(100, 20).toFixed(1), '16.7')
  assert.equal(growthAmount(200, 10).toFixed(1), '18.2')
  assert.ok(growthAmount(200, 10) > growthAmount(100, 20))
  assert.equal(compare.answer, 1)
  assert.match(compare.options[compare.answer], /18\.2/)

  const prose = GROWTH_COMPARISON_HANDOUT.sections
    .flatMap(section => section.blocks.map(textOf))
    .join('\n')
  assert.ok(prose.includes(growthAmount(100, 20).toFixed(1)), '讲义里的甲应与复算值一致')
  assert.ok(prose.includes(growthAmount(200, 10).toFixed(1)), '讲义里的乙应与复算值一致')

  const formula = GROWTH_COMPARISON_QUIZ[1]
  assert.equal(formula.answer, 0)
  assert.equal(growthAmount(110, 10), 10, '现期 110、增长 10% 时增长量为 10（基期 100）')
  assert.notEqual(110 * 0.1, 10, '直接用现期量乘增长率会算成 11')

  const statement = GROWTH_COMPARISON_QUIZ[2]
  assert.equal(statement.answer, 1)
  assert.ok(growthAmount(100, 20) < growthAmount(200, 10), '增长率更高的一方增长量反而更小，所以判断为错')
})

test('每套材料都标明自编、非真题，检测锚点都落在本课讲义小节', () => {
  for (const content of LESSON_CONTENTS) {
    assert.match(content.handout.provenance, /自编/)
    assert.match(content.handout.provenance, /非真题/)
    assert.match(content.quizProvenance, /自编/)
    assert.match(content.quizProvenance, /非真题/)

    const sectionIds = new Set(content.handout.sections.map(section => section.id))
    for (const question of content.quiz) {
      assert.ok(question.options.length >= 2, `${question.id} 选项过少`)
      assert.equal(new Set(question.options).size, question.options.length, `${question.id} 选项有重复`)
      assert.ok(question.answer >= 0 && question.answer < question.options.length, `${question.id} 答案下标越界`)
      assert.ok(question.why.length > 0, `${question.id} 缺少解析`)
      assert.ok(sectionIds.has(question.anchorId), `${question.id} 的锚点 ${question.anchorId} 不在本课讲义`)
    }
  }
})

test('讲义与检测不再出现没有依据的秒数或占比承诺', () => {
  const handoutText = LESSON_CONTENTS
    .map(content => content.handout.sections.flatMap(section => section.blocks.map(textOf)).join('\n'))
    .join('\n')
  const quizText = LESSON_CONTENTS
    .flatMap(content => content.quiz.flatMap(question => [question.prompt, ...question.options, question.why]))
    .join('\n')
  const all = [handoutText, quizText].join('\n')
  assert.doesNotMatch(all, /\d+(?:\.\d+)?\s*秒/)
  assert.doesNotMatch(all, /六成|成以上/)
})

test('与知识点无关的任务不命中任何一课，因此不会渲染这些内容', () => {
  const unrelated = ['资料分析综合', '增长率比较', '工程问题', '言语理解与表达', '数量关系', '判断推理']
  for (const text of unrelated) {
    assert.equal(resolveLessonContent({objective: text}), null, `目标「${text}」不应命中任何讲义`)
    assert.equal(resolveLessonContent({knowledgePoint: text}), null, `考点「${text}」不应命中任何讲义`)
    for (const content of LESSON_CONTENTS) {
      assert.equal(content.match(text), false, `「${text}」不应命中 ${content.id}`)
    }
  }
  assert.equal(resolveLessonContent(null), null)
  assert.equal(resolveLessonContent({}), null)
})
