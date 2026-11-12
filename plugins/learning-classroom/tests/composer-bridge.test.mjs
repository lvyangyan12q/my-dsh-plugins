import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createComposerFace } from '../src/composer.ts'

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
