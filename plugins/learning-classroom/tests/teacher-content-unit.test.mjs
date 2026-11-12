import assert from 'node:assert/strict'
import { test } from 'node:test'

const {
  composeExperiment,
  composeLecture,
  ensureExperimentCsp,
  experimentCsp,
  experimentDraftSchema,
  lectureDraftSchema,
  lectureRelativePath,
  readExperimentMeta,
} = await import('../src/teacher-content.ts')

const sources = ['《概率论》第 2 章', 'https://example.org/probability']

test('生成文件名只接受讲义目录内的 .md/.html，并拒绝越界、隐藏与非讲义扩展名', () => {
  assert.equal(lectureRelativePath('第一章/02-条件概率.md'), '讲义/第一章/02-条件概率.md')
  assert.equal(lectureRelativePath('讲义\\第二章\\03-实验.html'), '讲义/第二章/03-实验.html')
  assert.equal(lectureRelativePath('概览.md'), '讲义/概览.md')

  for (const bad of [
    '../其他主题/讲义/01.md',
    '第一章/../../01.md',
    '/绝对/01.md',
    'C:\\讲义\\01.md',
    '.隐藏/01.md',
    '第一章/.临时.md',
    '01.txt',
    '第一章/',
    '',
  ]) {
    assert.throws(() => lectureRelativePath(bad), /讲义|路径|扩展|文件名|隐藏|支持/, `${bad} 应被拒绝`)
  }
})

test('讲义草稿要求标题、解释正文与来源；组合文件保留 frontmatter、来源节和可读代码', () => {
  const draft = lectureDraftSchema.parse({
    fileName: '第一章/02-条件概率.md',
    title: '条件概率',
    order: 2,
    body: '条件概率的定义：\n\n```\nP(A|B) = P(A∩B) / P(B)\n```\n\n它是把样本空间缩小到 B 后的概率。',
    sources,
  })
  const markdown = composeLecture(draft)
  assert.match(markdown, /^---\ntitle: "条件概率"\norder: 2\ngenerated: teacher\n---\n/)
  assert.match(markdown, /^# 条件概率$/m)
  assert.match(markdown, /P\(A\|B\) = P\(A∩B\) \/ P\(B\)/)
  assert.match(markdown, /^## 来源$/m)
  assert.match(markdown, /- 《概率论》第 2 章/)
  assert.match(markdown, /- https:\/\/example\.org\/probability/)

  for (const bad of [
    { ...draft, body: '   ' },
    { ...draft, sources: [] },
    { ...draft, title: '条件\n概率' },
    { ...draft, sources: ['有\n换行'] },
  ]) {
    assert.equal(lectureDraftSchema.safeParse(bad).success, false)
  }
})

test('实验参数必须有限、范围有效、默认值在范围内且名称唯一', () => {
  const ok = experimentDraftSchema.parse({
    fileName: '03-贝叶斯实验.html',
    title: '贝叶斯更新',
    sources,
    parameters: [{ name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' }],
    html: '<!doctype html><html><body><canvas id="chart"></canvas><script>const x = 1</script></body></html>',
  })
  assert.equal(ok.parameters[0].default, 0.5)

  const base = {
    fileName: '03-实验.html',
    title: '实验',
    sources,
    parameters: [{ name: 'p', label: '概率', min: 0, max: 1, step: 0.1, default: 0.5, unit: '' }],
    html: '<html><body><script>1</script></body></html>',
  }
  for (const bad of [
    { ...base, parameters: [{ ...base.parameters[0], min: 1, max: 0 }] },
    { ...base, parameters: [{ ...base.parameters[0], default: 2 }] },
    { ...base, parameters: [{ ...base.parameters[0], step: 0 }] },
    { ...base, parameters: [{ ...base.parameters[0], name: 'bad name' }] },
    { ...base, parameters: [base.parameters[0], { ...base.parameters[0], label: '重复' }] },
    { ...base, parameters: [] },
    { ...base, html: '<html><body><script src="https://example.org/x.js"></script></body></html>' },
    { ...base, html: '<html><body><img src="https://example.org/x.png"></body></html>' },
    { ...base, html: '<html><body><script>fetch("https://example.org")</script></body></html>' },
    { ...base, html: '<html><body><script>localStorage.setItem("x", "1")</script></body></html>' },
    { ...base, html: '<html><body><script>new RTCPeerConnection()</script></body></html>' },
    { ...base, html: '<html><body><script>parent.postMessage("x", "*")</script></body></html>' },
    { ...base, html: '<html><body><img src="file:///D:/notes.md"></body></html>' },
    { ...base, html: '<html><body><a href="https://example.org">外链</a></body></html>' },
    { ...base, html: '<html><body><iframe src="https://example.org"></iframe></body></html>' },
  ]) {
    assert.equal(experimentDraftSchema.safeParse(bad).success, false, JSON.stringify(bad.html ?? bad.parameters))
  }
})

test('实验文件自带最小沙箱 CSP、来源与参数元数据，且可无损读回', () => {
  const draft = experimentDraftSchema.parse({
    fileName: '03-贝叶斯实验.html',
    title: '贝叶斯更新',
    sources,
    parameters: [
      { name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' },
      { name: 'likelihood', label: '似然', min: 0, max: 1, step: 0.01, default: 0.8, unit: '' },
    ],
    html: '<!doctype html><html><head><style>body{font-family:sans-serif}</style></head><body><canvas id="chart"></canvas><script>const prior = 0.5</script></body></html>',
  })
  const html = composeExperiment(draft)
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'unsafe-inline'/)
  assert.match(html, /connect-src 'none'/)
  assert.match(html, /<title>贝叶斯更新<\/title>/)
  assert.match(html, /<canvas id="chart"><\/canvas>/)
  assert.match(html, /<script>const prior = 0\.5<\/script>/)

  const meta = readExperimentMeta(html)
  assert.deepEqual(meta.sources, sources)
  assert.deepEqual(meta.parameters, draft.parameters)

  // The client-side guard is idempotent and never duplicates the policy.
  const twice = ensureExperimentCsp(ensureExperimentCsp(html))
  assert.equal(twice.match(/Content-Security-Policy/g)?.length, 1)
  assert.match(experimentCsp, /frame-src 'none'/)
})

test('既有或手写实验在渲染前也会补上同一份 CSP，片段 HTML 也能安全加载', () => {
  const fragment = '<p>手写实验</p><script>document.body.append("ok")</script>'
  const prepared = ensureExperimentCsp(fragment)
  assert.match(prepared, /Content-Security-Policy/)
  assert.match(prepared, /<p>手写实验<\/p>/)
  assert.equal(ensureExperimentCsp(prepared), prepared)

  // A stray marker or a model-authored policy must not suppress the classroom
  // policy: only the exact strong tag is accepted as already present.
  const fake = '<meta data-learning-classroom-csp="1"><p>绕过尝试</p>'
  assert.match(ensureExperimentCsp(fake), /Content-Security-Policy/)
})

test('CSP 是固定可信前缀：注释里的完整 CSP 标签和伪 <head> 都不能绕过或吞掉注入', () => {
  const fakeCsp = '<!-- <meta http-equiv="Content-Security-Policy" data-learning-classroom-csp="1" content="default-src *"> -->'
  const fakeHead = '<!-- <head> --><div title="<head>"><script>const fake = "<head>"</script><p>实验正文</p></div>'
  const secured = ensureExperimentCsp(`${fakeCsp}${fakeHead}`)
  assert.match(secured, /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/)
  assert.match(secured, /data-learning-classroom-csp="1"/)
  assert.match(secured, /<p>实验正文<\/p>/)
  // The trusted prefix is first, so the comment can never be mistaken for the
  // document's real head or for an already-applied policy.
  assert.ok(secured.indexOf('Content-Security-Policy') < secured.indexOf('<!-- <meta'))
  assert.equal(ensureExperimentCsp(secured), secured)
})

test('生成实验也把可信前缀放在模型 HTML 之前，元数据仍在真实 head', () => {
  const draft = experimentDraftSchema.parse({
    fileName: '04-伪head实验.html',
    title: '伪 head 实验',
    sources,
    parameters: [{ name: 'p', label: '概率', min: 0, max: 1, step: 0.1, default: 0.5, unit: '' }],
    html: '<!-- <head> --><div title="<head>"><p>正文</p></div>',
  })
  const html = composeExperiment(draft)
  assert.match(html, /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/)
  assert.ok(html.indexOf('<title>伪 head 实验</title>') < html.indexOf('<!-- <head> -->'))
  assert.match(html, /<p>正文<\/p>/)
  assert.deepEqual(readExperimentMeta(html).parameters, draft.parameters)
})
