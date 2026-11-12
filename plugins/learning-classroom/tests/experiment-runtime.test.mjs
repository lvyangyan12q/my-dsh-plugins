import assert from 'node:assert/strict'
import { test } from 'node:test'

const { buildExperimentSrcdoc, experimentRuntimeSource } = await import('../src/experiment-runtime.ts')

const spec = {
  format: 'learning-experiment/v1',
  title: '注入测试',
  sources: ['课堂'],
  parameters: [
    { name: 'prior', label: '先验', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' },
  ],
  readouts: [{
    name: 'posterior',
    label: '后验 </script><script>self["loc"+"ation"]="https://example.com"</script>\u2028\u2029',
    unit: '',
    decimals: 2,
    ast: { kind: 'param', name: 'prior' },
  }],
  render: {
    kind: 'line',
    xParameter: 'prior',
    samples: 32,
    xLabel: '先验',
    yLabel: '后验',
    series: [{ label: '后验 </script><script>alert(1)</script>', color: '#0969da', ast: { kind: 'param', name: 'prior' } }],
  },
}

test('iframe srcdoc 是固定可信 runtime；spec 只以转义 JSON 注入，不成为 HTML/脚本', () => {
  const html = buildExperimentSrcdoc(spec)
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /connect-src 'none'/)
  assert.match(html, /const SPEC = /)
  assert.match(html, /\\u003c\/script>/)
  assert.doesNotMatch(html, /<\/script><script>self/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.equal((html.match(/<script\b/gi) ?? []).length, 1, '除了固定 runtime 不得出现第二个 script')
  assert.doesNotMatch(html, /\u2028|\u2029/, 'U+2028/U+2029 必须转义')

  // The trusted runtime code itself never uses host/network/navigation APIs or
  // string-to-HTML assignment.
  for (const forbidden of ['innerHTML', 'outerHTML', 'postMessage', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'location', 'window.open', 'parent.', 'top.']) {
    assert.equal(experimentRuntimeSource.includes(forbidden), false, `runtime 不应包含 ${forbidden}`)
  }
})

test('iframe runtime 包含参数、读数和折线/柱状画布，不执行模型 HTML', () => {
  const line = buildExperimentSrcdoc(spec)
  assert.match(line, /canvas/)
  assert.match(line, /type = 'range'|type="range"/)
  assert.match(line, /toFixed/)
  assert.match(line, /kind === 'bars'|kind=="bars"/)

  const bars = buildExperimentSrcdoc({ ...spec, render: { ...spec.render, kind: 'bars' } })
  assert.match(bars, /bars/)
})

test('runtime 以浏览器实际 range 值初始化参数与显示，避免 step 吸附不一致', () => {
  assert.match(experimentRuntimeSource, /var initial = Number\(input\.value\)/)
  assert.match(experimentRuntimeSource, /values\[parameter\.name\] = initial/)
  assert.match(experimentRuntimeSource, /String\(initial\)/)
})
