/**
 * Proxy policy seam.
 *
 * The pipeline must never invent a proxy: an address comes from
 * `HTTP(S)_PROXY` / `ALL_PROXY` or from `proxy.url` in config.json, never from
 * the code and never from the operating system. These tests pin that policy,
 * the health check and the per-source routing through the same public entry
 * points the daily run uses, with fetch injected.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { defaultConfig, loadConfig, validateConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord } from '../src/storage.js'
import {
  checkProxyHealth,
  DEFAULT_PROXY_HEALTH_URL,
  DEFAULT_PROXY_TIMEOUT_MS,
  proxySkipReason,
  redactProxyUrl,
  resolveProxyUrl,
} from '../src/proxy.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'

const CONFIG_WITH_PROXY = { proxy: { url: 'http://config-proxy.local:3128' } }
const NOW = () => new Date('2026-11-05T01:00:00Z')

/** A fetch response with just the fields the health check reads. */
function response(status) {
  return { ok: status >= 200 && status < 300, status }
}

test('a proxy address comes from the environment first, https before all before http', () => {
  assert.deepEqual(
    resolveProxyUrl({
      config: CONFIG_WITH_PROXY,
      env: { HTTPS_PROXY: 'http://env-proxy.local:8080' },
    }),
    { url: 'http://env-proxy.local:8080', origin: 'env', code: null, error: null },
  )

  const fromAll = resolveProxyUrl({
    config: CONFIG_WITH_PROXY,
    env: { ALL_PROXY: 'http://all-proxy.local:1080', HTTP_PROXY: 'http://http-proxy.local:8888' },
  })
  assert.equal(fromAll.url, 'http://all-proxy.local:1080')
  assert.equal(fromAll.origin, 'env')

  const fromHttp = resolveProxyUrl({ config: {}, env: { HTTP_PROXY: 'http://http-proxy.local:8888' } })
  assert.equal(fromHttp.url, 'http://http-proxy.local:8888')
})

test('a bare host:port in the environment gains the http scheme', () => {
  const resolved = resolveProxyUrl({ env: { HTTPS_PROXY: 'proxy.local:7897' } })
  assert.equal(resolved.url, 'http://proxy.local:7897')
})

test('without an environment variable the configured proxy.url is used', () => {
  const resolved = resolveProxyUrl({ config: CONFIG_WITH_PROXY, env: {} })
  assert.deepEqual(resolved, { url: 'http://config-proxy.local:3128', origin: 'config', code: null, error: null })
})

test('no environment variable and no config entry means no proxy, not a system default', () => {
  const resolved = resolveProxyUrl({ config: {}, env: {} })
  assert.equal(resolved.url, null)
  assert.equal(resolved.origin, null)
  assert.equal(resolved.code, 'proxy_unconfigured')
})

test('blank environment values are ignored rather than used as an empty proxy', () => {
  assert.equal(resolveProxyUrl({ env: { HTTPS_PROXY: '   ', ALL_PROXY: '' } }).url, null)
})

test('a malformed environment proxy is reported, never guessed', () => {
  const resolved = resolveProxyUrl({ env: { HTTPS_PROXY: 'not a url' } })
  assert.equal(resolved.url, null)
  assert.equal(resolved.code, 'proxy_invalid')
  assert.match(resolved.error, /HTTPS_PROXY/)
})

test('proxy credentials are never part of the reported address', () => {
  const resolved = resolveProxyUrl({ env: { HTTPS_PROXY: 'http://user:secret@proxy.local:8080' } })
  assert.equal(resolved.url, 'http://user:secret@proxy.local:8080', 'the transport needs the credentials')
  assert.equal(redactProxyUrl(resolved.url), 'http://***@proxy.local:8080')
  assert.doesNotMatch(redactProxyUrl(resolved.url), /secret/)
  assert.equal(redactProxyUrl('not a url'), null)
})

/* ------------------------------------------------------------------ */
/* Health check                                                        */
/* ------------------------------------------------------------------ */

test('a healthy proxy passes the health check against a real target', async () => {
  const calls = []
  const result = await checkProxyHealth({
    url: 'http://proxy.local:8080',
    fetch: async (url, init) => {
      calls.push({ url, init })
      return response(200)
    },
    now: NOW,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.code, null)
  assert.equal(result.checkedAt, '2026-11-05T01:00:00.000Z')
  assert.equal(typeof result.latencyMs, 'number')
  assert.equal(calls.length, 1, 'exactly one probe request')
  assert.equal(calls[0].url, DEFAULT_PROXY_HEALTH_URL)
  assert.ok(calls[0].init.signal, 'the probe is abortable')
})

test('proxy authentication failures are named, whether they arrive as a status or an error', async () => {
  const asStatus = await checkProxyHealth({
    url: 'http://proxy.local:8080',
    fetch: async () => response(407),
    now: NOW,
  })
  assert.equal(asStatus.status, 'failed')
  assert.equal(asStatus.code, 'proxy_auth')
  assert.equal(asStatus.httpStatus, 407)

  const asError = await checkProxyHealth({
    url: 'http://proxy.local:8080',
    fetch: async () => { throw new Error('Proxy Authentication Required (407)') },
    now: NOW,
  })
  assert.equal(asError.status, 'failed')
  assert.equal(asError.code, 'proxy_auth')
})

test('an unanswered proxy is a timeout, not a retry loop', async () => {
  const result = await checkProxyHealth({
    url: 'http://proxy.local:8080',
    timeoutMs: 10,
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })))
    }),
    now: NOW,
  })

  assert.equal(result.status, 'timeout')
  assert.equal(result.code, 'proxy_timeout')
  assert.equal(result.checkedAt, '2026-11-05T01:00:00.000Z')
})

test('a refused proxy connection is a failure with its reason', async () => {
  const result = await checkProxyHealth({
    url: 'http://proxy.local:8080',
    fetch: async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7897'), { code: 'ECONNREFUSED' }) },
    now: NOW,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.code, 'proxy_unreachable')
  assert.match(result.error, /ECONNREFUSED/)
})

test('the health check never echoes proxy credentials', async () => {
  const result = await checkProxyHealth({
    url: 'http://user:secret@proxy.local:8080',
    fetch: async () => { throw new Error('could not reach http://user:secret@proxy.local:8080') },
    now: NOW,
  })

  assert.equal(result.status, 'failed')
  assert.doesNotMatch(result.error, /secret/)
  assert.match(result.error, /\*\*\*@proxy\.local:8080/)
})

test('without a proxy address there is nothing to check and fetch is never called', async () => {
  let called = false
  const result = await checkProxyHealth({ url: null, fetch: async () => { called = true; return response(200) } })
  assert.equal(result.status, 'unconfigured')
  assert.equal(result.code, 'proxy_unconfigured')
  assert.equal(called, false)
})

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

test('the defaults declare the proxy policy as data: only HF and OpenAI start proxied', () => {
  const config = defaultConfig()
  assert.deepEqual(config.proxy, {
    url: null,
    healthCheckUrl: DEFAULT_PROXY_HEALTH_URL,
    timeoutMs: DEFAULT_PROXY_TIMEOUT_MS,
  })
  assert.equal(config.sources.arxiv.useProxy, false, 'a directly reachable source never starts proxied')
  assert.equal(config.sources.hf.useProxy, true)
  assert.equal(config.sources.openai.useProxy, true)
})

test('a user config can switch a source off proxy and set the proxy URL', () => {
  const config = defaultConfig()
  const merged = validateConfig({
    ...config,
    proxy: { ...config.proxy, url: 'http://proxy.local:3128' },
    sources: { ...config.sources, hf: { ...config.sources.hf, useProxy: false } },
  })
  assert.equal(merged.proxy.url, 'http://proxy.local:3128')
  assert.equal(merged.sources.hf.useProxy, false)
  assert.equal(merged.sources.openai.useProxy, true, 'unrelated switches keep their default')
  assert.equal(merged.sources.arxiv.categories.length, 3, 'arxiv settings are untouched')
})

test('an invalid proxy or switch is an explicit config error naming the key', () => {
  const config = defaultConfig()
  const withProxy = value => ({ ...config, proxy: { ...config.proxy, ...value } })

  assert.throws(
    () => validateConfig(withProxy({ url: 'ftp://proxy.local:3128' })),
    error => error.code === 'config_invalid' && /proxy\.url/.test(error.message),
  )
  assert.throws(
    () => validateConfig(withProxy({ timeoutMs: 0 })),
    error => error.code === 'config_invalid' && /proxy\.timeoutMs/.test(error.message),
  )
  assert.throws(
    () => validateConfig(withProxy({ healthCheckUrl: 'nope' })),
    error => error.code === 'config_invalid' && /proxy\.healthCheckUrl/.test(error.message),
  )
  assert.throws(
    () => validateConfig({ ...config, sources: { ...config.sources, hf: { useProxy: 'yes' } } }),
    error => error.code === 'config_invalid' && /sources\.hf\.useProxy/.test(error.message),
  )
  assert.throws(
    () => validateConfig({ ...config, sources: { ...config.sources, hf: 'on' } }),
    error => error.code === 'config_invalid' && /sources\.hf/.test(error.message),
  )
})

test('config.json may supply the proxy, and the merged result is validated on load', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-proxy-config-'))
  const root = join(home, 'paper-reader')
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'config.json'), JSON.stringify({
      proxy: { url: 'http://proxy.local:3128' },
      sources: { hf: { useProxy: false } },
    }))

    const { config } = await loadConfig({ root })
    assert.equal(config.proxy.url, 'http://proxy.local:3128')
    assert.equal(config.proxy.healthCheckUrl, DEFAULT_PROXY_HEALTH_URL, 'unset proxy keys keep their default')
    assert.equal(config.sources.hf.useProxy, false)
    assert.equal(config.sources.openai.useProxy, true)
    assert.equal(config.sources.arxiv.categories.length, 3)

    writeFileSync(join(root, 'config.json'), JSON.stringify({ proxy: { url: 'nope' } }))
    await assert.rejects(
      loadConfig({ root }),
      error => error.code === 'config_invalid' && /proxy\.url/.test(error.message),
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})


/* ------------------------------------------------------------------ */
/* Run routing and degradation                                         */
/* ------------------------------------------------------------------ */

const DATE = '2026-11-04'
const RUN_NOW = () => new Date('2026-11-04T09:00:00+08:00')
const HEALTHY_ENV = { HTTPS_PROXY: 'http://proxy.local:8080', NODE_USE_ENV_PROXY: '1' }

const roots = []
function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-proxy-'))
  roots.push(home)
  return join(home, 'paper-reader')
}
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

/** A fetch that answers every request with `status`, recording the URLs. */
function fakeProxy({ status = 200, fail = null, handler = null } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push(String(url))
    if (fail) throw fail
    if (handler) return handler(url, init)
    return response(status)
  }
  return { impl, calls }
}

/** A source adapter double: one blog candidate, no network of its own. */
function fakeSource(id, { listFetchUrl = null } = {}) {
  const calls = { list: 0, extract: 0, fetches: [] }
  return {
    calls,
    adapter: {
      list: async ({ fetch }) => {
        calls.list += 1
        if (listFetchUrl) {
          calls.fetches.push(listFetchUrl)
          await fetch(listFetchUrl)
        }
        return [{
          id: `${id}:one`,
          sourceId: id,
          sourceLanguage: 'en',
          title: `${id} announcement`,
          summary: 'A short announcement.',
          url: `https://${id}.example/one`,
          publishedAt: '2026-11-04T00:00:00Z',
          direction: 'agent',
          tags: [id],
        }]
      },
      extract: async () => {
        calls.extract += 1
        return { blocks: [{ type: 'paragraph', original: 'Announcement body.' }], excerpt: false, warnings: [] }
      },
    },
  }
}

function proxiedConfig(overrides = {}) {
  return { ...defaultConfig(), ...overrides }
}

test('a healthy proxy runs proxied sources through it while direct sources stay direct', async () => {
  const root = tempRoot()
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy()
  const hf = fakeSource('hf', { listFetchUrl: 'https://huggingface.co/api/daily_papers?date=2026-11-04' })

  const result = await runDaily({
    root,
    date: DATE,
    config: proxiedConfig(),
    fetch: direct.impl,
    proxyFetch: proxy.impl,
    adapters: { hf: hf.adapter },
    env: HEALTHY_ENV,
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(hf.calls.list, 1, 'the proxied source runs when the proxy is healthy')
  assert.ok(proxy.calls.includes('https://huggingface.co/api/daily_papers?date=2026-11-04'), 'its request went through the proxy')
  assert.ok(direct.calls.every(url => url.includes('arxiv.org')), 'the direct fetch only saw direct sources')

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'arxiv:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
    'hf:one',
  ])
  assert.equal(digest.run.proxy.status, 'ok')
  assert.equal(digest.run.proxy.origin, 'env')
  assert.equal(digest.run.proxy.url, 'http://proxy.local:8080')
  assert.deepEqual(digest.run.sources.map(source => source.status), ['ok', 'ok'])
})

test('a source marked useProxy has every request answered by the proxy and never by a direct connection', async () => {
  const root = tempRoot()
  const config = proxiedConfig()
  config.sources.arxiv.useProxy = true
  config.proxy.url = 'http://user:secret@proxy.local:8080'
  const directCalls = []
  const direct = async (url) => {
    directCalls.push(String(url))
    throw new Error('a proxied source must never fall back to a direct request')
  }
  const proxy = fakeArxiv({ articles: FULL_TEXT })
  const healthChecks = []
  const proxyFetch = async (url, init) => {
    if (String(url) === DEFAULT_PROXY_HEALTH_URL) {
      healthChecks.push(String(url))
      return response(200)
    }
    return proxy.impl(url, init)
  }

  const result = await runDaily({
    root,
    date: DATE,
    config,
    fetch: direct,
    proxyFetch,
    env: {},
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(directCalls.length, 0, 'no direct request was attempted')
  assert.equal(healthChecks.length, 1, 'the proxy was checked once before the run')
  assert.equal(proxy.calls.length, 4, 'one Atom request plus three article requests went through the proxy')
  assert.ok(proxy.calls.some(url => url.includes('/html/')), 'extraction uses the proxy too')

  const { digest } = await readDayDigest({ root, date: DATE })
  const record = await readRunRecord({ root, date: DATE })
  assert.equal(digest.run.proxy.url, 'http://***@proxy.local:8080')
  for (const document of [JSON.stringify(digest), JSON.stringify(record)]) {
    assert.doesNotMatch(document, /secret/, 'proxy credentials are never written to data')
  }
})

test('without a proxy address the proxied source is skipped and the reason is stored for the page', async () => {
  const root = tempRoot()
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const hf = fakeSource('hf')
  const proxy = fakeProxy()

  const result = await runDaily({
    root,
    date: DATE,
    config: proxiedConfig(),
    fetch: direct.impl,
    proxyFetch: proxy.impl,
    adapters: { hf: hf.adapter },
    env: {},
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 0, 'the directly reachable source still wrote the day')
  assert.equal(result.status, 'partial')
  assert.equal(hf.calls.list, 0, 'a proxied source never runs without a proxy')
  assert.equal(proxy.calls.length, 0, 'there is nothing to probe without an address')

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'arxiv:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
  ])
  const skipped = digest.run.sources.find(source => source.id === 'hf')
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.code, 'proxy_unconfigured')
  assert.match(skipped.reason, /未配置代理/)
  assert.equal(skipped.label, 'Hugging Face')
  assert.equal(digest.run.proxy.status, 'unconfigured')
  assert.deepEqual(digest.run.proxy.skipped, ['hf'])

  const record = await readRunRecord({ root, date: DATE })
  const hfRecord = record.sources.find(source => source.id === 'hf')
  assert.equal(hfRecord.status, 'skipped')
  assert.equal(hfRecord.code, 'proxy_unconfigured')
  assert.equal(record.proxy.code, 'proxy_unconfigured')
  assert.deepEqual(record.proxy.skipped, ['hf'])
})

test('a broken proxy skips only the affected sources, with the failure named', async () => {
  const scenarios = [
    { name: 'authentication failure', env: HEALTHY_ENV, proxyFetch: fakeProxy({ status: 407 }), code: 'proxy_auth' },
    { name: 'authentication error', env: HEALTHY_ENV, proxyFetch: fakeProxy({ fail: new Error('Proxy Authentication Required (407)') }), code: 'proxy_auth' },
    {
      name: 'timeout',
      env: HEALTHY_ENV,
      timeoutMs: 10,
      proxyFetch: fakeProxy({
        handler: (_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
      }),
      code: 'proxy_timeout',
    },
    { name: 'unreachable', env: HEALTHY_ENV, proxyFetch: fakeProxy({ fail: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }), code: 'proxy_unreachable' },
    { name: 'environment proxy without NODE_USE_ENV_PROXY', env: { HTTPS_PROXY: 'http://proxy.local:8080' }, code: 'proxy_env_disabled' },
    { name: 'configured proxy without a transport', env: {}, configProxyUrl: 'http://proxy.local:8080', code: 'proxy_transport_missing' },
    { name: 'invalid environment address', env: { HTTPS_PROXY: 'not a url' }, code: 'proxy_invalid' },
  ]

  for (const scenario of scenarios) {
    test(`  -> ${scenario.name}`, async () => {
      const root = tempRoot()
      const config = proxiedConfig()
      if (scenario.configProxyUrl) config.proxy.url = scenario.configProxyUrl
      if (scenario.timeoutMs) config.proxy.timeoutMs = scenario.timeoutMs
      const direct = fakeArxiv({ articles: FULL_TEXT })
      const hf = fakeSource('hf')

      const result = await runDaily({
        root,
        date: DATE,
        config,
        fetch: direct.impl,
        proxyFetch: scenario.proxyFetch?.impl ?? null,
        adapters: { hf: hf.adapter },
        env: scenario.env,
        now: RUN_NOW,
      })

      assert.equal(result.exitCode, 0, 'the direct source still produced the day')
      assert.equal(result.status, 'partial')
      assert.equal(hf.calls.list, 0, 'the proxied source was not attempted directly')

      const { digest } = await readDayDigest({ root, date: DATE })
      const skipped = digest.run.sources.find(source => source.id === 'hf')
      assert.equal(skipped.status, 'skipped')
      assert.equal(skipped.code, scenario.code)
      assert.equal(skipped.reason, proxySkipReason(scenario.code))
      assert.equal(digest.run.proxy.code, scenario.code)
      assert.equal(digest.run.proxy.status === 'ok', false)
      assert.deepEqual(digest.run.proxy.skipped, ['hf'])
      assert.equal(digest.run.sources.find(source => source.id === 'arxiv').status, 'ok')

      const record = await readRunRecord({ root, date: DATE })
      assert.equal(record.sources.find(source => source.id === 'hf').status, 'skipped')
      assert.equal(record.proxy.code, scenario.code)
    })
  }
})

test('when the only source needs an unavailable proxy the run writes no digest and fails loudly', async () => {
  const root = tempRoot()
  const config = proxiedConfig()
  config.sources.arxiv.useProxy = true
  const directCalls = []
  const direct = async (url) => {
    directCalls.push(String(url))
    throw new Error('a proxied source must never fall back to a direct request')
  }

  const result = await runDaily({
    root,
    date: DATE,
    config,
    fetch: direct,
    proxyFetch: fakeProxy({ status: 407 }).impl,
    env: HEALTHY_ENV,
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.status, 'failed')
  assert.equal(directCalls.length, 0, 'no silent direct retry')
  assert.equal(result.written.digest, null)
  await assert.rejects(readDayDigest({ root, date: DATE }), error => error.code === 'digest_missing')

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.sources[0].status, 'skipped')
  assert.equal(record.sources[0].code, 'proxy_auth')
})

test('a run with no proxied source never checks or uses the proxy', async () => {
  const root = tempRoot()
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy()

  const result = await runDaily({
    root,
    date: DATE,
    config: proxiedConfig(),
    fetch: direct.impl,
    proxyFetch: proxy.impl,
    env: HEALTHY_ENV,
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(proxy.calls.length, 0, 'a healthy proxy is not contacted when no source needs it')
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.run.proxy.status, 'not_needed')
  assert.deepEqual(digest.run.proxy.skipped, [])
})

test('switching a source off proxy sends it to the direct fetch instead', async () => {
  const root = tempRoot()
  const config = proxiedConfig()
  config.sources.hf.useProxy = false
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy()
  const hf = fakeSource('hf', { listFetchUrl: 'https://huggingface.co/api/daily_papers?date=2026-11-04' })

  const result = await runDaily({
    root,
    date: DATE,
    config,
    fetch: direct.impl,
    proxyFetch: proxy.impl,
    adapters: { hf: hf.adapter },
    env: HEALTHY_ENV,
    now: RUN_NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.ok(direct.calls.includes('https://huggingface.co/api/daily_papers?date=2026-11-04'))
  assert.ok(!proxy.calls.includes('https://huggingface.co/api/daily_papers?date=2026-11-04'))
  assert.equal(result.proxy.status, 'not_needed')
})
