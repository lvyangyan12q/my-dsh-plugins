import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createComposerFace } from '../src/composer.ts'
import { formatQuestionBlock } from '../src/question-context.ts'

/**
 * Seam under test: the adapter to the Host's public composer faces. These cases
 * pin the refusal branches that the panel test cannot reach naturally: no
 * `conversation` service, a preserved/blocked/unknown Host answer, a sending
 * phase, and a draft that already carries reference chips. Every refusal must
 * name a real reason and must not fall back to a second input or a fake send.
 */

const block = '【提问上下文】\n主题：概率论\n摘录：\n> 条件概率'

function bindingFor(sessionId) {
  return { sessionId, ctx: { sessionId } }
}

function faceWith(conversation, reference = { sessionId: 's1', binding: bindingFor('s1') }) {
  return createComposerFace({ spaceId: 'space-1', reference, conversation: () => conversation })
}

test('宿主没有 conversation 服务时明确报告缺少原生输入接缝，不伪造草稿', () => {
  const face = faceWith(undefined)
  assert.equal(face.available(), false)
  assert.equal(face.draft(), null)
  const result = face.append(block)
  assert.equal(result.ok, false)
  assert.match(result.reason, /原生输入接缝/)
  // Unsubscribing from an unavailable draft is a noop, never a throw.
  const unsubscribe = face.subscribe(() => {})
  unsubscribe()
  assert.equal(face.remove(block).ok, false)
})

test('追加把草稿交给公开 append 语义：宿主保留、阻塞或抛错都不算成功', () => {
  const calls = []
  const make = mode => ({
    input: {
      requestDraftInitialization(binding, options) {
        calls.push({ binding, options })
        if (mode === 'throw') throw new Error('turn in flight')
        return mode
      },
      for() { throw new Error('未挂载') },
    },
  })

  const applied = faceWith(make('applied'))
  assert.deepEqual(applied.append(block), { ok: true })
  assert.equal(calls[0].options.whenDraftExists, 'append')
  assert.equal(calls[0].options.prompt, block)
  assert.equal(calls[0].binding.sessionId, 's1')

  const preserved = faceWith(make('preserved')).append(block)
  assert.equal(preserved.ok, false)
  assert.match(preserved.reason, /保留/)

  const blocked = faceWith(make('blocked')).append(block)
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /发送|关闭/)

  const thrown = faceWith(make('throw')).append(block)
  assert.equal(thrown.ok, false)
  assert.match(thrown.reason, /turn in flight/)
})

test('移除只在可编辑的普通草稿上改写：发送中与含引用标签时拒绝，缺块/重块不猜', () => {
  const state = { draft: block, phase: 'plain', draftRev: 1, occurrences: [] }
  const setDraftCalls = []
  const input = {
    state: { getSnapshot: () => ({ ...state, occurrences: [...state.occurrences] }) },
    setDraft(text) { setDraftCalls.push(text); state.draft = text },
  }
  const conversation = {
    input: {
      requestDraftInitialization() { return 'applied' },
      for() { return input },
    },
  }
  const face = faceWith(conversation)

  state.phase = 'sending'
  const sending = face.remove(block)
  assert.equal(sending.ok, false)
  assert.match(sending.reason, /发送/)
  assert.deepEqual(setDraftCalls, [])

  state.phase = 'plain'
  state.occurrences = [{ offset: 0, length: 1, clipboardText: '@x' }]
  const chips = face.remove(block)
  assert.equal(chips.ok, false)
  assert.match(chips.reason, /引用标签/)
  assert.deepEqual(setDraftCalls, [])

  state.occurrences = []
  state.draft = '原草稿'
  const missing = face.remove(block)
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /找不到/)
  assert.deepEqual(setDraftCalls, [])

  state.draft = `${block}\n\n${block}`
  const ambiguous = face.remove(block)
  assert.equal(ambiguous.ok, false)
  assert.match(ambiguous.reason, /多个/)
  assert.deepEqual(setDraftCalls, [])

  state.draft = `原草稿\n\n${block}`
  assert.deepEqual(face.remove(block), { ok: true })
  assert.deepEqual(setDraftCalls, ['原草稿'])
  assert.equal(state.draft, '原草稿')
})

test('多条已知上下文并存时只移除目标块：先扣除未改动的已知块，再查未知引用', () => {
  const first = formatQuestionBlock({
    kind: 'lecture', spaceTitle: '概率论', title: '条件概率', path: '讲义/01.md',
    version: 'a'.repeat(64), unsaved: false, excerpt: '第一段摘录', truncated: false,
  }, 'q1')
  const second = formatQuestionBlock({
    kind: 'lecture', spaceTitle: '概率论', title: '条件概率', path: '讲义/01.md',
    version: 'a'.repeat(64), unsaved: false, excerpt: '第二段摘录', truncated: false,
  }, 'q2')
  const setDraftCalls = []
  const state = { draft: '', phase: 'plain', draftRev: 1, occurrences: [] }
  const input = {
    state: { getSnapshot: () => ({ ...state, occurrences: [...state.occurrences] }) },
    setDraft(text) { setDraftCalls.push(text); state.draft = text },
  }
  const face = faceWith({
    input: { requestDraftInitialization() { return 'applied' }, for() { return input } },
  })

  // Both blocks quote their excerpt, so the other known block's '> ' lines must
  // not be mistaken for an unknown native quote.
  state.draft = `${first}\n\n${second}`
  assert.deepEqual(face.remove(first, [second]), { ok: true })
  assert.deepEqual(setDraftCalls, [`\n\n${second}`])

  // An unknown blockquote outside the known blocks still blocks the rewrite.
  state.draft = `学习者自己的话\n\n> 原生引用\n\n${first}\n\n${second}`
  const unknownQuote = face.remove(first, [second])
  assert.equal(unknownQuote.ok, false)
  assert.match(unknownQuote.reason, /引用/)

  // A duplicated known block is not "unchanged": refuse rather than guess which
  // copy the learner means.
  state.draft = `${first}\n\n${second}\n\n${second}`
  const duplicate = face.remove(first, [second])
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.reason, /重复|多个/)
  assert.deepEqual(setDraftCalls, [`\n\n${second}`])
})

test('命令 chip 与原生引用块存在时拒绝整体改写：公开状态无法证明结构无损', () => {
  const block = '【提问上下文】\n主题：概率论\n摘录：\n> 条件概率'
  const setDraftCalls = []
  const state = { draft: `原草稿\n\n${block}`, phase: 'claimed', draftRev: 1, occurrences: [], claim: { name: 'goal', token: '/goal ' } }
  const input = {
    state: { getSnapshot: () => ({ ...state, occurrences: [...state.occurrences] }) },
    setDraft(text) { setDraftCalls.push(text); state.draft = text },
  }
  const face = faceWith({
    input: { requestDraftInitialization() { return 'applied' }, for() { return input } },
  })

  // A claimed command chip is public state (phase/claim); setDraft would drop it.
  const claimed = face.remove(block)
  assert.equal(claimed.ok, false)
  assert.match(claimed.reason, /命令/)
  assert.deepEqual(setDraftCalls, [])

  // Even a "plain" phase with a stale claim counts as a command chip.
  state.phase = 'plain'
  const staleClaim = face.remove(block)
  assert.equal(staleClaim.ok, false)
  assert.match(staleClaim.reason, /命令/)
  assert.deepEqual(setDraftCalls, [])

  // A native quote projects as ordinary Markdown blockquote text; quotes are
  // absent from InputState.occurrences, so the only sound rule is: a remaining
  // blockquote line means we cannot prove the rewrite is structural-lossless.
  state.claim = undefined
  state.draft = `原草稿\n\n> 被引用的讲义原话\n\n${block}`
  const quoted = face.remove(block)
  assert.equal(quoted.ok, false)
  assert.match(quoted.reason, /引用|手动删除/)
  assert.deepEqual(setDraftCalls, [])

  // The appended block's own quoted excerpt must not make its removal impossible.
  state.draft = `原草稿\n\n${block}`
  assert.deepEqual(face.remove(block), { ok: true })
  assert.deepEqual(setDraftCalls, ['原草稿'])
})
