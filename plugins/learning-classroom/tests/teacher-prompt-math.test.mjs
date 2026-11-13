import assert from 'node:assert/strict'
import { test } from 'node:test'

const { createTeacherTools } = await import('../src/teacher-tools.ts')

test('老师写讲义工具的正文说明要求 LaTeX 公式，不再把公式一律当代码块', () => {
  const lecture = createTeacherTools({
    hasBoundSession: () => true,
    writeGenerated: async () => { throw new Error('not used') },
  }).find(entry => entry.definition.name === 'classroom_lecture_write')
  assert.ok(lecture)
  const description = lecture.definition.parameters.properties.body.description
  assert.match(description, /\$\.\.\.\$/)
  assert.match(description, /\$\$\.\.\.\$\$/)
  assert.match(description, /代码/)
  assert.doesNotMatch(description, /公式与代码用可读的 Markdown 代码块/)
})
