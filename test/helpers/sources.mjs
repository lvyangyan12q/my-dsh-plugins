/**
 * Composed source fixtures for the pipeline tests.
 *
 * A daily run normally fetches every enabled source. This helper routes the
 * DeepSeek docs host to `fakeDeepSeek` and everything else to `fakeArxiv`, so a
 * test can exercise the real selection/quota path without the network and
 * without each source's fake knowing about the others.
 */
import { fakeArxiv } from './arxiv.mjs'
import { fakeDeepSeek } from './deepseek.mjs'

export function fakeSources({ arxiv, deepseek } = {}) {
  const arxivFake = fakeArxiv(arxiv)
  const deepseekFake = fakeDeepSeek(deepseek)
  const calls = []

  const impl = async (url, init) => {
    const target = String(url)
    calls.push(target)
    if (target.includes('api-docs.deepseek.com')) return deepseekFake.impl(target, init)
    return arxivFake.impl(target, init)
  }

  return { impl, calls, arxivCalls: arxivFake.calls, deepseekCalls: deepseekFake.calls }
}
