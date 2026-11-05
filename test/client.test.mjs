/**
 * Reading-page behaviour across source languages and modes.
 *
 * These tests mount the real built client bundle in jsdom and assert on the
 * rendered DOM: which column comes first, which languages each mode shows,
 * neutral blocks appearing once, and untranslated text staying visible.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mountPage } from './helpers/client.mjs'

const sample = JSON.parse(readFileSync(new URL('../sample/digest.json', import.meta.url), 'utf8'))

const EN_ITEM = {
  id: 'en-one',
  sourceId: 'arxiv',
  sourceLanguage: 'en',
  title: { original: 'English original title', translation: '英文原文标题' },
  summary: { original: 'English summary sentence.', translation: '中文导读。' },
  direction: 'agent',
  collectedAt: '2026-11-04T08:00:00+08:00',
  readingMinutes: 7,
  translationState: 'complete',
  blocks: [
    { type: 'heading', level: 1, original: 'Abstract', translation: '摘要' },
    { type: 'paragraph', original: 'English body paragraph.', translation: '中文正文段落。' },
  ],
}

const ZH_ITEM = {
  id: 'zh-one',
  sourceId: 'deepseek',
  sourceLanguage: 'zh',
  title: { original: '中文原文标题', translation: 'Chinese original title' },
  summary: { original: '中文导读。', translation: 'English summary sentence.' },
  direction: 'agent',
  collectedAt: '2026-11-04T07:30:00+08:00',
  readingMinutes: 5,
  translationState: 'complete',
  blocks: [
    { type: 'heading', level: 1, original: '摘要', translation: 'Abstract' },
    { type: 'paragraph', original: '中文正文段落。', translation: 'Chinese body paragraph.' },
  ],
}

const DIRECTIONS = [{ id: 'agent', label: 'Agent' }]
const SOURCES = [
  { id: 'arxiv', label: 'arXiv', short: 'A' },
  { id: 'deepseek', label: 'DeepSeek', short: 'D' },
]

function digestOf(items, schemaVersion = 2) {
  return {
    schemaVersion,
    generatedAt: '2026-11-04T09:00:00+08:00',
    directions: DIRECTIONS,
    sources: SOURCES,
    days: [{ date: '2026-11-04', items }],
  }
}

function columnsOf(container, type = 'paragraph') {
  const block = container.querySelector(`.pr-body [data-block-type="${type}"]`)
  assert.ok(block, `a rendered ${type} block should exist`)
  return Array.from(block.querySelectorAll('[data-column]'))
}

async function withPage(options, run) {
  const page = await mountPage(options)
  try {
    await run(page)
  } finally {
    await page.unmount()
  }
}

test('English source: 对照 mode shows the English original first, Chinese translation second', async () => {
  await withPage({ digest: digestOf([EN_ITEM]), mode: 'both' }, ({ container }) => {
    const columns = columnsOf(container)
    assert.equal(columns.length, 2)
    assert.equal(columns[0].getAttribute('data-column'), 'original')
    assert.equal(columns[0].getAttribute('data-lang'), 'en')
    assert.match(columns[0].textContent, /English body paragraph/)
    assert.equal(columns[1].getAttribute('data-column'), 'translation')
    assert.equal(columns[1].getAttribute('data-lang'), 'zh')
    assert.match(columns[1].textContent, /中文正文段落/)

    const legend = container.querySelector('.pr-legend')
    assert.match(legend.textContent, /原文/)
    assert.match(legend.textContent, /English/)
    assert.match(legend.textContent, /译文/)
    assert.ok(legend.textContent.indexOf('原文') < legend.textContent.indexOf('译文'))
  })
})

test('Chinese source: 对照 mode puts the Chinese original on the left and English on the right', async () => {
  await withPage({ digest: digestOf([ZH_ITEM]), mode: 'both' }, ({ container }) => {
    const columns = columnsOf(container)
    assert.equal(columns[0].getAttribute('data-lang'), 'zh')
    assert.match(columns[0].textContent, /中文正文段落/)
    assert.equal(columns[1].getAttribute('data-lang'), 'en')
    assert.match(columns[1].textContent, /Chinese body paragraph/)

    const legend = container.querySelector('.pr-legend')
    assert.match(legend.textContent, /中文/)
    assert.match(legend.textContent, /English/)
  })
})

test('English source: 仅中文 shows the Chinese translation and hides the English paragraph', async () => {
  await withPage({ digest: digestOf([EN_ITEM]), mode: 'zh' }, ({ bodyText }) => {
    const text = bodyText()
    assert.match(text, /中文正文段落/)
    assert.doesNotMatch(text, /English body paragraph/)
  })
})

test('English source: English mode shows the original and hides the Chinese paragraph', async () => {
  await withPage({ digest: digestOf([EN_ITEM]), mode: 'en' }, ({ bodyText }) => {
    const text = bodyText()
    assert.match(text, /English body paragraph/)
    assert.doesNotMatch(text, /中文正文段落/)
  })
})

test('Chinese source: 仅中文 shows the Chinese original rather than the English translation', async () => {
  await withPage({ digest: digestOf([ZH_ITEM]), mode: 'zh' }, ({ bodyText }) => {
    const text = bodyText()
    assert.match(text, /中文正文段落/)
    assert.doesNotMatch(text, /Chinese body paragraph/)
  })
})

test('Chinese source: English mode shows the English translation', async () => {
  await withPage({ digest: digestOf([ZH_ITEM]), mode: 'en' }, ({ bodyText }) => {
    const text = bodyText()
    assert.match(text, /Chinese body paragraph/)
    assert.doesNotMatch(text, /中文正文段落/)
  })
})

test('language-neutral blocks render once in every mode', async () => {
  const item = {
    ...EN_ITEM,
    id: 'neutral-one',
    blocks: [
      {
        type: 'equation',
        display: 'E = mc^{2}',
        detail: '',
        label: '(1)',
        note: { original: 'Mass-energy equivalence.', translation: '质能等价。' },
      },
      {
        type: 'figure',
        diagram: { title: 'Pipeline', steps: ['propose', 'filter'] },
        caption: { original: 'Figure caption.', translation: '图注。' },
      },
      { type: 'code', code: 'const answer = 42' },
    ],
  }
  for (const mode of ['both', 'zh', 'en']) {
    await withPage({ digest: digestOf([item]), mode }, ({ container, bodyText }) => {
      assert.equal(container.querySelectorAll('.pr-equation').length, 1, `equation count in ${mode}`)
      assert.equal(container.querySelectorAll('.pr-figure').length, 1, `figure count in ${mode}`)
      assert.equal(container.querySelectorAll('.pr-code').length, 1, `code count in ${mode}`)
      assert.equal(bodyText().split('E = mc').length - 1, 1, `equation body count in ${mode}`)
      assert.equal(bodyText().split('const answer = 42').length - 1, 1, `code count in ${mode}`)
    })
  }
})

test('a pending translation shows a placeholder, then falls back with a 未翻译 marker', async () => {
  const item = {
    ...EN_ITEM,
    id: 'pending-one',
    translationState: 'pending',
    blocks: [
      { type: 'paragraph', original: 'Untranslated body.', translation: null, translationState: 'pending' },
    ],
  }

  await withPage({ digest: digestOf([item]), mode: 'both' }, ({ container }) => {
    const translation = container.querySelector('[data-column="translation"]')
    assert.ok(translation.querySelector('.pr-pending'), '对照 mode shows the skeleton placeholder')
    assert.match(container.textContent, /翻译进行中/)
  })

  await withPage({ digest: digestOf([item]), mode: 'zh' }, ({ container, bodyText }) => {
    assert.ok(container.querySelector('.pr-missing'), '仅中文 mode falls back to the original')
    assert.match(bodyText(), /Untranslated body/)
    assert.match(container.textContent, /未翻译/)
  })

  await withPage({ digest: digestOf([item]), mode: 'en' }, ({ bodyText }) => {
    assert.match(bodyText(), /Untranslated body/)
  })
})

test('a legacy v1 digest (en/zh fields) still reads in every mode', async () => {
  const legacy = {
    schemaVersion: 1,
    directions: DIRECTIONS,
    sources: SOURCES,
    days: [{
      date: '2026-11-04',
      items: [{
        id: 'legacy-one',
        sourceId: 'arxiv',
        titleZh: '旧中文标题',
        titleEn: 'Legacy English title',
        summaryZh: '旧中文导读。',
        direction: 'agent',
        collectedAt: '2026-11-04T06:00:00+08:00',
        blocks: [
          { type: 'heading', en: 'Abstract', zh: '摘要' },
          { type: 'paragraph', en: 'Legacy English body.', zh: '旧中文正文。' },
        ],
      }],
    }],
  }

  await withPage({ digest: legacy, mode: 'both' }, ({ container }) => {
    const columns = columnsOf(container)
    assert.equal(columns[0].getAttribute('data-lang'), 'en')
    assert.match(columns[0].textContent, /Legacy English body/)
    assert.match(columns[1].textContent, /旧中文正文/)
  })

  await withPage({ digest: legacy, mode: 'zh' }, ({ bodyText }) => {
    assert.match(bodyText(), /旧中文正文/)
    assert.doesNotMatch(bodyText(), /Legacy English body/)
  })

  await withPage({ digest: legacy, mode: 'en' }, ({ bodyText }) => {
    assert.match(bodyText(), /Legacy English body/)
    assert.doesNotMatch(bodyText(), /旧中文正文/)
  })
})

test('the bundled sample renders: Chinese-source item keeps its language order and marks a pending translation', async () => {
  await withPage({ digest: sample, mode: 'both', prefs: { activeId: 'deepseek-v3-2024' } }, ({ container }) => {
    assert.ok(container.querySelector('[data-source-language="zh"].pr-chip-inline'), 'Chinese-origin chip is visible')
    const columns = columnsOf(container)
    assert.equal(columns[0].getAttribute('data-lang'), 'zh')
    assert.equal(columns[1].getAttribute('data-lang'), 'en')
    assert.match(container.textContent, /翻译进行中/)
  })

  await withPage({ digest: sample, mode: 'en', prefs: { activeId: 'deepseek-v3-2024' } }, ({ container, bodyText }) => {
    assert.match(bodyText(), /未翻译/)
  })
})

test('blog items carry their Anthropic and Kimi source names into the list and the reader', async () => {
  const BLOG_SOURCES = [
    ...SOURCES,
    { id: 'anthropic', label: 'Anthropic', short: 'A' },
    { id: 'kimi', label: 'Kimi', short: 'K' },
  ]
  const anthropic = {
    ...EN_ITEM,
    id: 'anthropic:news/claude-opus-4-5',
    sourceId: 'anthropic',
    title: { original: 'Claude Opus 4.5 arrives', translation: 'Claude Opus 4.5 发布' },
  }
  const kimi = {
    ...EN_ITEM,
    id: 'kimi:kimi-k3-1-pro',
    sourceId: 'kimi',
    title: { original: 'Kimi K3.1 Pro', translation: 'Kimi K3.1 Pro 发布' },
  }
  const digest = { ...digestOf([anthropic, kimi]), sources: BLOG_SOURCES }

  await withPage({ digest, mode: 'both', prefs: { activeId: kimi.id } }, async ({ container, click }) => {
    const badges = [...container.querySelectorAll('.pr-source')]
    assert.ok(badges.some(badge => badge.getAttribute('title') === 'Anthropic'))
    assert.ok(badges.some(badge => badge.getAttribute('title') === 'Kimi'))
    assert.match(container.textContent, /Kimi/, 'the active Kimi item names its source')

    await click(container.querySelectorAll('.pr-item')[0])
    assert.match(container.textContent, /Anthropic/, 'the active Anthropic item names its source')
  })
})

test('the list shows each item in Chinese primary and English secondary, whichever is the original', async () => {
  await withPage({ digest: digestOf([EN_ITEM, ZH_ITEM]), mode: 'both' }, ({ container }) => {
    const zhItem = container.querySelector('.pr-item')
    const items = container.querySelectorAll('.pr-item')
    assert.equal(items.length, 2)

    const titles = Array.from(items).map(item => ({
      primary: item.querySelector('.pr-item-title-zh')?.textContent,
      secondary: item.querySelector('.pr-item-title-en')?.textContent,
    }))
    assert.deepEqual(
      titles.find(entry => entry.primary === '中文原文标题'),
      { primary: '中文原文标题', secondary: 'Chinese original title' },
    )
    assert.deepEqual(
      titles.find(entry => entry.primary === '英文原文标题'),
      { primary: '英文原文标题', secondary: 'English original title' },
    )
    assert.ok(zhItem)
  })
})
