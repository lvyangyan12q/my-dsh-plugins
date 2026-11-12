import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

/**
 * Seam under test: the classroom panel rendered in jsdom with the public
 * Session service and the public Conversation input seam replaced by fakes.
 * The fakes stand in for `sessions.retain` and for
 * `conversation.input.requestDraftInitialization` / `input.for(scope)`, so the
 * scaffold can prove: the current draft is appended to and never replaced,
 * nothing is sent, the context strip can show and remove exactly the appended
 * block, unsaved note text is used and labelled, and switching lecture files
 * does not rewrite what was already appended.
 *
 * Not proven here: the real Host's draft persistence, the real composer DOM,
 * streaming, sending and what the model actually receives. Those belong to the
 * installed-DSH browser acceptance (G07) and must not be inferred from this
 * file.
 */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}
for (const [key, value] of Object.entries(globals)) {
  try { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) } catch { /* Node may own navigator. */ }
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { ClassroomPanel } = await import('../src/classroom-panel.tsx')
const { TeacherConversationSeat } = await import('../src/session-zone.tsx')

const vault = { path: 'D:/知识库', status: 'ready', reason: null, hint: '' }
const notePath = '笔记/我的笔记.md'
const lecturePath = '讲义/01-条件概率.md'
const secondLecturePath = '讲义/02-全概率公式.md'
const lectureContent = '# 条件概率\n\n条件概率的定义：在事件 B 发生的条件下，事件 A 发生的概率。\n'
const secondLectureContent = '# 全概率公式\n\n全概率公式把复杂事件拆成互斥情形。\n'
const noteDiskContent = '磁盘上已经保存的笔记。\n'

function space(overrides) {
  return {
    id: 'space-1',
    title: '概率论',
    directory: '概率论',
    notePath,
    createdAt: '2026-11-09T00:00:00.000Z',
    sessionId: 'session-teacher',
    cwd: 'D:/知识库/概率论',
    linkedLectures: [],
    lecturePath,
    layout: undefined,
    ...overrides,
  }
}

function view(overrides = {}) {
  return { vault: { ...vault }, spaces: [space()], currentSpaceId: 'space-1', ...overrides }
}

const lectureVersions = new Map([
  [lecturePath, `version:${lectureContent}`],
  [secondLecturePath, `version:${secondLectureContent}`],
])

function fakeClient(initial = view()) {
  const calls = []
  return {
    calls,
    async load() { return structuredClone(initial) },
    async listLectures(spaceId) {
      return {
        spaceId,
        lectures: [
          { path: lecturePath, fileName: '01-条件概率.md', title: '条件概率', order: 1, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
          { path: secondLecturePath, fileName: '02-全概率公式.md', title: '全概率公式', order: 2, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
        ],
        selectedPath: lecturePath,
        missingSelection: null,
        folderMissing: false,
      }
    },
    async readLecture(spaceId, path) {
      calls.push({ type: 'read-lecture', path })
      const content = path === lecturePath ? lectureContent : secondLectureContent
      return {
        spaceId,
        path,
        fileName: path.split('/').pop(),
        title: path === lecturePath ? '条件概率' : '全概率公式',
        kind: 'markdown',
        content,
        placeholder: null,
        version: lectureVersions.get(path),
      }
    },
    async listNotes() {
      return { notes: [{ path: notePath, name: '我的笔记.md' }], defaultPath: notePath }
    },
    async readNote(spaceId, path) {
      return { path, content: noteDiskContent, version: 'd'.repeat(64), updatedAt: '2026-11-09T00:00:00.000Z' }
    },
    async saveNote() { throw new Error('本测试不保存笔记') },
    async command(input) {
      calls.push({ type: 'command', ...input })
      if (input.action === 'space-open') return structuredClone(initial)
      throw new Error(`本测试不接受命令：${String(input.action)}`)
    },
  }
}

/** Fake `sessions` service whose references carry the public `binding`. */
function createSessionService() {
  const retains = []
  const releases = []
  return {
    retains,
    releases,
    service: {
      async create() { return 'created-session' },
      retain(id, options) {
        retains.push({ id, options })
        const binding = { sessionId: id, ctx: { sessionId: id } }
        return {
          sessionId: id,
          binding,
          ready: Promise.resolve(binding),
          release() { releases.push(id) },
        }
      },
      cancel() {},
    },
  }
}

/**
 * Fake public Conversation input seam. It owns one draft string and mirrors the
 * documented `append` semantics: existing text is kept, the prompt is added as
 * new paragraphs. It deliberately exposes no send: the scaffold must never call
 * one.
 */
function createConversation(options = {}) {
  let draft = options.draft ?? ''
  let mode = options.mode ?? 'apply'
  const initializationCalls = []
  const setDraftCalls = []
  const submitCalls = []
  const listeners = new Set()
  const notify = () => { for (const listener of listeners) listener() }
  const snapshot = () => ({ draft, phase: 'plain', draftRev: 1, occurrences: [] })
  const input = {
    requestDraftInitialization(binding, init) {
      initializationCalls.push({ binding, init })
      if (mode === 'blocked') return 'blocked'
      if (mode === 'preserved') return 'preserved'
      const prompt = init.prompt ?? ''
      const when = init.whenDraftExists ?? (init.clearPreviousDraft === true ? 'replace' : 'keep')
      if (when === 'keep') return 'preserved'
      if (when === 'append') {
        draft = draft.trim() === '' ? prompt : `${draft}\n\n${prompt}`
        notify()
        return 'applied'
      }
      draft = prompt
      notify()
      return 'applied'
    },
    for() {
      return {
        state: {
          getSnapshot: snapshot,
          subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        },
        setDraft(text) {
          setDraftCalls.push(text)
          draft = text
          notify()
        },
        focus() {},
        submit() { submitCalls.push(draft) },
      }
    },
  }
  return {
    input,
    initializationCalls,
    setDraftCalls,
    submitCalls,
    draft: () => draft,
    setMode(next) { mode = next },
    setDraftDirect(text) { draft = text; notify() },
  }
}

function createSlotRuntime() {
  function SessionProvider({ session, children }) {
    return h(React.createContext(undefined).Provider, { value: session }, children)
  }
  function SlotSeat() {
    return h(TeacherConversationSeat, {
      sessionId: 'session-teacher',
      renderFactorySlot: () => h('div', { 'data-testid': 'conversation-content' }),
    })
  }
  return {
    renderSlot: () => h(SlotSeat),
    SessionProvider,
  }
}

async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(props) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, props)) })
  await settle()
  const runtime = props.renderSlot === undefined ? null : createSlotRuntime()
  void runtime
  return {
    document: dom.window.document,
    container,
    text: () => container.textContent,
    async click(button) {
      await act(async () => { button.click() })
      await settle()
    },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function buttonIn(document, regionLabel, label) {
  const region = [...document.querySelectorAll(`[aria-label="${regionLabel}"]`)]
  for (const row of region) {
    for (const button of row.querySelectorAll('button')) {
      if (button.textContent.includes(label)) return button
    }
  }
  return undefined
}

function contextBar(document) {
  return document.querySelector('[aria-label="提问上下文条"]')
}

async function mountedPanel(t, overrides = {}) {
  const sessions = createSessionService()
  const conversation = overrides.conversation ?? createConversation()
  const slots = createSlotRuntime()
  const client = overrides.client ?? fakeClient()
  const ui = await mount({
    client,
    sessions: sessions.service,
    renderSlot: slots.renderSlot,
    SessionProvider: slots.SessionProvider,
    getConversation: () => overrides.conversationService === 'absent' ? undefined : { input: conversation.input },
    ...overrides.panelProps,
  })
  t.after(async () => { await ui.unmount() })
  return { ui, sessions, conversation, client }
}

test('问老师把冻结上下文追加到已有原生草稿：不覆盖、不自动发送', async t => {
  const conversation = createConversation({ draft: '我自己已经打了一半的问题。' })
  const { ui } = await mountedPanel(t, { conversation })

  const ask = buttonIn(ui.document, '讲义', '问老师')
  assert.ok(ask, '讲义区应有问老师按钮')
  await ui.click(ask)

  assert.equal(conversation.initializationCalls.length, 1)
  const call = conversation.initializationCalls[0]
  assert.equal(call.init.whenDraftExists, 'append')
  assert.equal(call.binding.sessionId, 'session-teacher')
  assert.match(call.init.prompt, /^【提问上下文】/)
  assert.match(call.init.prompt, /主题：概率论/)
  assert.match(call.init.prompt, /讲义《条件概率》/)
  assert.match(call.init.prompt, new RegExp(`版本：version:${lectureContent.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`))
  assert.match(call.init.prompt, /^> # 条件概率/m)

  // The native draft keeps the learner's own text first; nothing replaced it,
  // and no send path was used.
  assert.ok(conversation.draft().startsWith('我自己已经打了一半的问题。'))
  assert.ok(conversation.draft().includes('【提问上下文】'))
  assert.deepEqual(conversation.setDraftCalls, [])
  assert.deepEqual(conversation.submitCalls, [])
  assert.match(ui.text(), /已追加到老师输入框，未发送/)

  const bar = contextBar(ui.document)
  assert.ok(bar, '应有可查看的提问上下文条')
  assert.match(bar.textContent, /提问上下文（1）/)
  assert.match(bar.textContent, /讲义《条件概率》/)
})

async function selectDom(startNode, startOffset, endNode, endOffset) {
  await act(async () => {
    const range = dom.window.document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const selection = dom.window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

function clearDomSelection() {
  dom.window.getSelection()?.removeAllRanges()
}

function lectureParagraph(document) {
  return [...document.querySelectorAll('.lc-lecture-doc p')]
    .find(paragraph => paragraph.textContent.includes('条件概率的定义'))
}

test('讲义内选段只附选段本身，并标为选段而不是整篇讲义', async t => {
  const conversation = createConversation()
  const { ui } = await mountedPanel(t, { conversation })
  t.after(clearDomSelection)

  const paragraph = lectureParagraph(ui.document)
  assert.ok(paragraph, '讲义正文应已渲染')
  await selectDom(paragraph.firstChild, 0, paragraph.firstChild, '条件概率的定义'.length)

  await ui.click(buttonIn(ui.document, '讲义', '问老师'))

  assert.equal(conversation.initializationCalls.length, 1)
  const prompt = conversation.initializationCalls[0].init.prompt
  assert.match(prompt, /讲义《条件概率》选段/)
  assert.match(prompt, /^> 条件概率的定义/m)
  // The rest of the lecture (heading and following prose) is not attached.
  assert.doesNotMatch(prompt, /^> # 条件概率/m)
  assert.doesNotMatch(prompt, /全概率公式/)
})

test('选区跨出讲义正文（anchor 在讲义、焦点在笔记，或反向）时不得当作讲义选段', async t => {
  const conversation = createConversation()
  const { ui } = await mountedPanel(t, { conversation })
  t.after(clearDomSelection)

  const paragraph = lectureParagraph(ui.document)
  const notesHeading = ui.document.querySelector('[aria-label="我的笔记"] h2')?.firstChild
  assert.ok(paragraph && notesHeading, '讲义与笔记区都应已渲染')

  // Anchor inside the lecture, focus in another zone: the old anchor-only guard
  // would label the notes text as an excerpt of the lecture.
  await selectDom(paragraph.firstChild, 0, notesHeading, 2)
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  assert.equal(conversation.initializationCalls.length, 0, '跨区选区不得追加')
  assert.doesNotMatch(contextBar(ui.document).textContent, /提问上下文（1）/)
  assert.match(ui.text(), /不在讲义正文内/)

  // A range that starts before the lecture (the course directory) and ends
  // inside it also carries non-body text: the start endpoint must be checked.
  const directoryHeading = ui.document.querySelector('[aria-label="课程目录"] h2')?.firstChild
  assert.ok(directoryHeading, '课程目录应已渲染')
  await selectDom(directoryHeading, 0, paragraph.firstChild, '条件概率的定义'.length)
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  assert.equal(conversation.initializationCalls.length, 0, '起点在讲义外的选区也不得追加')
  assert.match(ui.text(), /不在讲义正文内/)
})

test('上下文条可查看摘录与版本，并可移除；移除精确恢复原草稿', async t => {
  const conversation = createConversation({ draft: '原有草稿' })
  const { ui } = await mountedPanel(t, { conversation })

  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  const bar = contextBar(ui.document)
  const viewButton = buttonIn(ui.document, '提问上下文条', '查看摘录')
  assert.ok(viewButton)
  await ui.click(viewButton)
  assert.match(contextBar(ui.document).textContent, /## 条件概率|条件概率的定义/)

  const remove = buttonIn(ui.document, '提问上下文条', '移除上下文')
  assert.ok(remove, '上下文条应可移除刚追加的上下文')
  await ui.click(remove)

  assert.deepEqual(conversation.setDraftCalls, ['原有草稿'])
  assert.equal(conversation.draft(), '原有草稿')
  assert.match(contextBar(ui.document).textContent, /已移除这段提问上下文/)
  assert.match(contextBar(ui.document).textContent, /还没有待发送的提问上下文/)
  assert.match(ui.text(), /已移除这段提问上下文/)
})

test('切到另一个知识点不改写已追加的上下文，也不动原生草稿', async t => {
  const conversation = createConversation()
  const { ui } = await mountedPanel(t, { conversation })
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  const frozen = conversation.initializationCalls[0].init.prompt

  const second = [...ui.document.querySelectorAll('[aria-label="课程目录"] button')]
    .find(button => button.textContent === '全概率公式')
  assert.ok(second, '目录里应有第二个知识点')
  await ui.click(second)

  assert.equal(conversation.initializationCalls.length, 1, '切换知识点不应再次追加')
  assert.equal(conversation.initializationCalls[0].init.prompt, frozen)
  assert.match(contextBar(ui.document).textContent, /条件概率/)
  assert.doesNotMatch(contextBar(ui.document).textContent, /全概率公式/)
})

test('未保存的笔记片段使用当前编辑文本并标注未保存，默认不附整篇笔记', async t => {
  const conversation = createConversation()
  const { ui } = await mountedPanel(t, { conversation })

  const editor = ui.document.querySelector('textarea[aria-label="笔记编辑器"]')
  assert.ok(editor, '笔记区应有编辑器')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(editor, `${noteDiskContent}\n我还没保存的新理解：条件概率不是因果。`)
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await settle(1)

  const notesAsk = buttonIn(ui.document, '我的笔记', '问老师')
  assert.ok(notesAsk, '笔记区应有问老师按钮')

  // Without a selection the whole personal note is never attached.
  await ui.click(notesAsk)
  assert.equal(conversation.initializationCalls.length, 0)
  assert.match(ui.text(), /先在笔记里选中要问的片段/)
  assert.match(ui.text(), /不会默认附加整篇笔记/)

  const start = editor.value.indexOf('我还没保存的新理解')
  await act(async () => { editor.setSelectionRange(start, editor.value.length) })
  await ui.click(notesAsk)

  assert.equal(conversation.initializationCalls.length, 1)
  const prompt = conversation.initializationCalls[0].init.prompt
  assert.match(prompt, /笔记《我的笔记》/)
  assert.match(prompt, /未保存/)
  assert.match(prompt, /^> 我还没保存的新理解：条件概率不是因果。/m)
  assert.doesNotMatch(prompt, /磁盘上已经保存的笔记/)
})

test('发送后已发内容仍是当时的主题、版本与摘录；上下文条只做本地整理', async t => {
  const conversation = createConversation({ draft: '我的问题：' })
  const { ui } = await mountedPanel(t, { conversation })
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))

  // The native send path is not ours; simulate the Host accepting the draft,
  // which clears the composer draft exactly like a sent message.
  const sent = conversation.draft()
  assert.ok(sent.startsWith('我的问题：'))
  assert.match(sent, /主题：概率论/)
  assert.match(sent, /讲义《条件概率》/)
  await act(async () => { conversation.setDraftDirect('') })
  await settle(1)

  const bar = contextBar(ui.document)
  assert.match(bar.textContent, /已不在草稿/)
  assert.match(bar.textContent, /可能已发送/)
  assert.ok(buttonIn(ui.document, '提问上下文条', '从列表移除'), '已发送的上下文只能从列表整理')
  await ui.click(buttonIn(ui.document, '提问上下文条', '从列表移除'))
  assert.match(contextBar(ui.document).textContent, /还没有待发送的提问上下文/)
  assert.deepEqual(conversation.setDraftCalls, [], '清理列表不会改写已发送的历史或草稿')
  // Sent text is untouched by the list cleanup, including the frozen excerpt.
  assert.match(sent, /条件概率的定义/)
})

test('草稿里有原生引用块时拒绝整体移除，提示手动删除且不改写草稿', async t => {
  const conversation = createConversation()
  const { ui } = await mountedPanel(t, { conversation })
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  const appended = conversation.draft()

  // The learner quoted transcript text into the native composer after appending;
  // that quote is atomic editor structure and is absent from InputState.
  await act(async () => { conversation.setDraftDirect(`${appended}\n\n> 被引用的讲义原话`) })
  await settle(1)

  await ui.click(buttonIn(ui.document, '提问上下文条', '移除上下文'))
  assert.deepEqual(conversation.setDraftCalls, [], '含引用结构时不得整体改写草稿')
  assert.match(contextBar(ui.document).textContent, /引用|手动删除/)
  assert.match(conversation.draft(), /> 被引用的讲义原话/)
  assert.match(conversation.draft(), /【提问上下文】/)
})

test('原生输入接缝不可用或被宿主拒绝时明确说明，不伪造追加成功', async t => {
  const blocked = createConversation({ draft: '草稿', mode: 'blocked' })
  const { ui } = await mountedPanel(t, { conversation: blocked })
  await ui.click(buttonIn(ui.document, '讲义', '问老师'))
  assert.match(ui.text(), /草稿未改动|正在发送|已关闭/)
  assert.ok(contextBar(ui.document), '被拒绝时仍应保留可查看的上下文条')
  assert.doesNotMatch(contextBar(ui.document).textContent, /提问上下文（1）/)

  await ui.unmount()

  const conversation = createConversation()
  const client = fakeClient()
  const sessions = createSessionService()
  const slots = createSlotRuntime()
  const noSeam = await mount({
    client,
    sessions: sessions.service,
    renderSlot: slots.renderSlot,
    SessionProvider: slots.SessionProvider,
    getConversation: () => undefined,
  })
  try {
    const ask = buttonIn(noSeam.document, '讲义', '问老师')
    assert.ok(ask, '缺少输入接缝时仍应说明状态而不是消失')
    assert.equal(ask.disabled, true)
    assert.match(noSeam.text(), /宿主尚未提供原生输入接缝/)
    assert.equal(conversation.initializationCalls.length, 0)
  } finally {
    await noSeam.unmount()
  }
})
