import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annotationBlockFor } from '../src/annotation-flow.ts'

const spaceDirectory = '概率论'
const base = '概率论/讲义/第一章/01.md'

function fakeClient(results) {
  const calls = []
  return {
    calls,
    client: {
      async resolveLink(input) {
        calls.push(input.target)
        const result = results[input.target]
        if (result === undefined) throw new Error(`未准备解析结果：${input.target}`)
        return result
      },
    },
  }
}

function ok(target, { heading = null, link }) {
  return {
    spaceId: 'space-1', target, status: 'ok', file: '概率论/讲义/第一章/01.md',
    spacePath: '讲义/第一章/01.md', kind: 'lecture', heading, blockId: null,
    link, candidates: [], message: null,
  }
}

const input = { path: '讲义/第一章/01.md', title: '第一节', excerpt: '样本空间可以缩小。', truncated: false, heading: '第一节' }

test('标题真实存在时生成带标题的 Vault 相对来源链接', async () => {
  const fake = fakeClient({
    [`${base}#第一节`]: ok(`${base}#第一节`, { heading: '第一节', link: `[[${base}#第一节]]` }),
  })
  const result = await annotationBlockFor(fake.client, 'space-1', spaceDirectory, input)
  assert.equal(result.ok, true)
  assert.equal(result.link, `[[${base}#第一节]]`)
  assert.equal(result.block.includes(`来源：[[${base}#第一节]]`), true)
  assert.match(result.block, /样本空间可以缩小。/)
  assert.equal(result.block.includes('^'), false)
})

test('标题核对失败时退回真实文件链接并保留摘录与说明，不伪造标题', async () => {
  const fake = fakeClient({
    [`${base}#第一节`]: {
      spaceId: 'space-1', target: `${base}#第一节`, status: 'missing', file: null, spacePath: null,
      kind: 'file', heading: null, blockId: null, link: null, candidates: [],
      message: '目标文件里没有标题「第一节」；不会生成假锚点。',
    },
    [base]: ok(base, { link: `[[${base}]]` }),
  })
  const result = await annotationBlockFor(fake.client, 'space-1', spaceDirectory, input)
  assert.equal(result.ok, true)
  assert.equal(result.link, `[[${base}]]`)
  assert.match(result.message, /标题|文件链接/)
  assert.match(result.block, /样本空间可以缩小。/)
  assert.equal(result.block.includes('#第一节'), false)
  assert.deepEqual(fake.calls, [`${base}#第一节`, base])
})

test('没有标题时直接使用真实文件链接，只请求一次', async () => {
  const fake = fakeClient({ [base]: ok(base, { link: `[[${base}]]` }) })
  const result = await annotationBlockFor(fake.client, 'space-1', spaceDirectory, { ...input, heading: null })
  assert.equal(result.ok, true)
  assert.equal(result.block.includes(`来源：[[${base}]]`), true)
  assert.deepEqual(fake.calls, [base])
})

test('讲义缺失或无法解析时明确失败，不生成没有来源的批注', async () => {
  const fake = fakeClient({
    [`${base}#第一节`]: {
      spaceId: 'space-1', target: `${base}#第一节`, status: 'missing', file: null, spacePath: null,
      kind: 'file', heading: null, blockId: null, link: null, candidates: [],
      message: '知识文件库里找不到这个文件。',
    },
    [base]: {
      spaceId: 'space-1', target: base, status: 'missing', file: null, spacePath: null,
      kind: 'file', heading: null, blockId: null, link: null, candidates: [],
      message: '知识文件库里找不到这个文件：概率论/讲义/第一章/01.md',
    },
  })
  const result = await annotationBlockFor(fake.client, 'space-1', spaceDirectory, input)
  assert.equal(result.ok, false)
  assert.equal(result.block, undefined)
  assert.match(result.message, /找不到|无法/)
})

test('来源路径越出当前学习空间时拒绝，不接受客户端拼出的假路径', async () => {
  const fake = fakeClient({})
  const result = await annotationBlockFor(fake.client, 'space-1', spaceDirectory, {
    ...input, path: '../别的空间/讲义/01.md', heading: null,
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /路径|学习空间|越界/)
  assert.equal(fake.calls.length, 0)
})
