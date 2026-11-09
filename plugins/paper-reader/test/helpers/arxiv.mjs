/**
 * Shared arXiv fixtures for the pipeline tests.
 *
 * `fakeArxiv` answers the Atom query with the captured feed and each
 * `arxiv.org/html/<id>` request with a captured article, a 404, or an injected
 * failure. Nothing here touches the network.
 */
import { readFileSync } from 'node:fs'

export const ATOM = readFileSync(new URL('../fixtures/arxiv-atom.xml', import.meta.url), 'utf8')
export const ARTICLE = readFileSync(new URL('../fixtures/arxiv-article.html', import.meta.url), 'utf8')

export const FULL_TEXT = {
  '2611.05377': ARTICLE,
  '2611.05382': ARTICLE,
}

export function fakeArxiv({ atom = ATOM, articles = {}, failQuery = null, failArticles = {} } = {}) {
  const calls = []
  const impl = async (url) => {
    const target = String(url)
    calls.push(target)
    if (target.includes('/api/query')) {
      if (failQuery) throw failQuery
      return { ok: true, status: 200, text: async () => atom }
    }
    const id = target.split('/').pop()
    if (failArticles[id]) throw failArticles[id]
    if (Object.prototype.hasOwnProperty.call(articles, id)) {
      return { ok: true, status: 200, text: async () => articles[id] }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  return { impl, calls }
}
