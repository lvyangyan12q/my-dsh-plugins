/**
 * Shared DeepSeek fixtures for the adapter and pipeline tests.
 *
 * `fakeDeepSeek` answers the sitemap and the per-slug Markdown pair (English and
 * `/zh-cn/` Chinese) from captured samples. Nothing here touches the network;
 * a missing Chinese page is a real 404, which is exactly the degradation the
 * adapter has to handle.
 */
import { readFileSync } from 'node:fs'

export const SITEMAP = readFileSync(new URL('../fixtures/deepseek-sitemap.xml', import.meta.url), 'utf8')
export const NEWS_EN = readFileSync(new URL('../fixtures/deepseek-news-en.md', import.meta.url), 'utf8')
export const NEWS_ZH = readFileSync(new URL('../fixtures/deepseek-news-zh.md', import.meta.url), 'utf8')
export const PARTIAL_EN = readFileSync(new URL('../fixtures/deepseek-news-partial-en.md', import.meta.url), 'utf8')
export const PARTIAL_ZH = readFileSync(new URL('../fixtures/deepseek-news-partial-zh.md', import.meta.url), 'utf8')
export const MONO_EN = readFileSync(new URL('../fixtures/deepseek-news-mono-en.md', import.meta.url), 'utf8')

/** The slugs the sitemap advertises, with the pages each one actually has. */
export const DEFAULT_NEWS = {
  news261104: { en: NEWS_EN, zh: NEWS_ZH },
  news261103: { en: PARTIAL_EN, zh: PARTIAL_ZH },
  news261102: { en: MONO_EN, zh: null },
}

export function fakeDeepSeek({
  sitemap = SITEMAP,
  news = DEFAULT_NEWS,
  failSitemap = null,
  failPages = {},
} = {}) {
  const calls = []
  const impl = async (url) => {
    const target = String(url)
    calls.push(target)

    if (target.endsWith('/sitemap.xml')) {
      if (failSitemap) throw failSitemap
      return { ok: true, status: 200, text: async () => sitemap }
    }

    const match = /^(?:https?:\/\/[^/]+)?(?:\/zh-cn)?\/news\/([^/]+)\.md$/.exec(target)
    if (!match) return { ok: false, status: 404, text: async () => 'not found' }
    const slug = match[1]
    const chinese = target.includes('/zh-cn/')
    if (failPages[slug]) throw failPages[slug]
    const page = news[slug]
    const body = page ? (chinese ? page.zh : page.en) : null
    if (!body) return { ok: false, status: 404, text: async () => 'not found' }
    return { ok: true, status: 200, text: async () => body }
  }
  return { impl, calls }
}
