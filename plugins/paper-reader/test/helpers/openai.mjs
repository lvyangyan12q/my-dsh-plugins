/**
 * Shared OpenAI fixtures for the source tests.
 *
 * `fakeOpenai` answers the news RSS request with the captured feed and every
 * `openai.com/index/<slug>` request with a captured article, a chosen HTTP
 * status or an injected failure. Nothing here touches the network.
 */
import { readFileSync } from 'node:fs'

export const RSS = readFileSync(new URL('../fixtures/openai-rss.xml', import.meta.url), 'utf8')
export const ARTICLE = readFileSync(new URL('../fixtures/openai-article.html', import.meta.url), 'utf8')

export function slugOf(url) {
  const match = /openai\.com\/index\/([^/?#]+)/.exec(String(url))
  return match ? match[1] : null
}

export function fakeOpenai({ rss = RSS, articles = {}, failRss = null, failArticles = {}, statusArticles = {} } = {}) {
  const calls = []
  const impl = async (url) => {
    const target = String(url)
    calls.push(target)
    if (target.includes('/news/rss.xml')) {
      if (failRss) throw failRss
      return { ok: true, status: 200, text: async () => rss }
    }
    const slug = slugOf(target)
    if (statusArticles[slug]) {
      return { ok: false, status: statusArticles[slug], text: async () => 'blocked' }
    }
    if (failArticles[slug]) throw failArticles[slug]
    if (slug && Object.prototype.hasOwnProperty.call(articles, slug)) {
      return { ok: true, status: 200, text: async () => articles[slug] }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  return { impl, calls, articleCalls: () => calls.filter(url => url.includes('/index/')) }
}
