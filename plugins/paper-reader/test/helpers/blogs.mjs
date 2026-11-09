/**
 * Anthropic and Kimi fixtures.
 *
 * `fakeBlogSources` answers the sitemap, the Kimi list, the Kimi article pages
 * and the Anthropic article pages from the captured fixtures. Nothing here
 * touches the network, and every call is recorded so a test can assert which
 * pages were fetched.
 */
import { readFileSync } from 'node:fs'

export const ANTHROPIC_SITEMAP = readFileSync(
  new URL('../fixtures/anthropic-sitemap.xml', import.meta.url),
  'utf8',
)
export const ANTHROPIC_ARTICLE = readFileSync(
  new URL('../fixtures/anthropic-article.html', import.meta.url),
  'utf8',
)
export const KIMI_LIST = readFileSync(new URL('../fixtures/kimi-list.html', import.meta.url), 'utf8')
export const KIMI_ARTICLE = readFileSync(new URL('../fixtures/kimi-article.html', import.meta.url), 'utf8')

export const SITEMAP_URL = 'https://www.anthropic.com/sitemap.xml'
export const KIMI_LIST_URL = 'https://www.kimi.com/blog/'

export const ANTHROPIC_PATHS = {
  'news/claude-opus-4-5': ANTHROPIC_ARTICLE,
  'research/agentic-coding': ANTHROPIC_ARTICLE,
  'research/interpretability-update': ANTHROPIC_ARTICLE,
}

export const KIMI_SLUGS = ['kimi-k3-1-pro', 'kimi-k3', 'kimi-k2-5']

function notFound() {
  return { ok: false, status: 404, text: async () => 'not found' }
}

/**
 * Route an Anthropic or Kimi URL to a fixture.
 *
 * `failAnthropic` / `failKimi` map a path or slug to an Error thrown instead of
 * answering, which is how a per-article failure is simulated.
 */
export function fakeBlogSources({
  sitemap = ANTHROPIC_SITEMAP,
  anthropicArticles = ANTHROPIC_PATHS,
  kimiList = KIMI_LIST,
  kimiArticles = Object.fromEntries(KIMI_SLUGS.map(slug => [slug, KIMI_ARTICLE])),
  failSitemap = null,
  failList = null,
  failAnthropic = {},
  failKimi = {},
} = {}) {
  const calls = []
  const impl = async (url) => {
    const target = String(url)
    calls.push(target)
    const parsed = new URL(target)
    const path = parsed.pathname

    if (parsed.hostname === 'www.anthropic.com' && path === '/sitemap.xml') {
      if (failSitemap) throw failSitemap
      return { ok: true, status: 200, text: async () => sitemap }
    }
    if (parsed.hostname === 'www.kimi.com' && (path === '/blog/' || path === '/blog')) {
      if (failList) throw failList
      return { ok: true, status: 200, text: async () => kimiList }
    }
    if (parsed.hostname === 'www.anthropic.com') {
      const key = path.replace(/^\/+/, '')
      if (failAnthropic[key]) throw failAnthropic[key]
      if (Object.prototype.hasOwnProperty.call(anthropicArticles, key)) {
        return { ok: true, status: 200, text: async () => anthropicArticles[key] }
      }
      return notFound()
    }
    if (parsed.hostname === 'www.kimi.com' && path.startsWith('/en/blog/')) {
      const slug = path.slice('/en/blog/'.length)
      if (failKimi[slug]) throw failKimi[slug]
      if (Object.prototype.hasOwnProperty.call(kimiArticles, slug)) {
        return { ok: true, status: 200, text: async () => kimiArticles[slug] }
      }
      return notFound()
    }
    return notFound()
  }
  return { impl, calls }
}

/** One fetch for the whole pipeline: chat completions, arXiv, then blogs. */
export function fakePipelineFetch({ llm, arxiv, blogs }) {
  return async (url, init) => {
    const target = String(url)
    if (target.includes('/chat/completions')) return llm.impl(url, init)
    if (target.includes('arxiv.org')) return arxiv.impl(url, init)
    return blogs.impl(url, init)
  }
}
