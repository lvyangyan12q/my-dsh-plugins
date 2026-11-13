import { type ComponentType, type NamedExoticComponent, type ReactNode } from 'react'
import { mathMarkdown } from './math.ts'

/** One recognised formula handed to a math renderer. */
export interface MathRendererProps {
  tex: string
  display: boolean
}

/** A math renderer renders only recognised TeX; it never receives user HTML. */
export type MathRenderer = (props: MathRendererProps) => ReactNode

interface HostMarkdownTextProps {
  text: string
  labels: {
    code: { copyLabel: string; copiedLabel: string }
    footnotes: string
  }
}

interface HostPrimitives {
  /** `MarkdownText` is `React.memo(...)`, i.e. an exotic component object. */
  MarkdownText?: ComponentType<HostMarkdownTextProps> | NamedExoticComponent<HostMarkdownTextProps>
}

type HostRequire = (specifier: string) => unknown

/**
 * The public client platform singleton. DSH seeds this package in
 * `packages/client/web/src/seed.ts` and `dsh.client.inject` asks the module
 * loader to arrive it before this bundle; its `MarkdownText` is the supported
 * KaTeX-backed renderer for untrusted Markdown. The lookup stays lazy so unit
 * tests can inject a renderer or a host, and a host without the package cannot
 * crash classroom activation.
 */
const HOST_MODULE = '@deepseek-ai/dsh-client-ui-primitives'
const HOST_LABELS = {
  code: { copyLabel: '复制', copiedLabel: '已复制' },
  footnotes: '脚注',
} as const

let resolvedHost: HostPrimitives | undefined

function hostPrimitives(): HostPrimitives | null {
  if (resolvedHost !== undefined) return resolvedHost
  const request = typeof require === 'function'
    ? require
    : (globalThis as { __LC_HOST_REQUIRE__?: HostRequire }).__LC_HOST_REQUIRE__
  if (typeof request !== 'function') return null
  try {
    const candidate = request(HOST_MODULE)
    const MarkdownText = (candidate as HostPrimitives | undefined)?.MarkdownText
    if (candidate !== null && typeof candidate === 'object'
      && MarkdownText !== undefined && MarkdownText !== null) {
      resolvedHost = candidate as HostPrimitives
      return resolvedHost
    }
  } catch {
    // A host without the client platform module is a real degradation; the
    // fallback below says so instead of pretending the formula is typeset.
  }
  return null
}

/**
 * Render one formula through the host's KaTeX renderer.
 *
 * Only the recognised TeX source is passed to `MarkdownText`, wrapped in the
 * matching delimiters. Neighbouring user text, links, wikilinks and raw HTML
 * never enter this string, and `MarkdownText` itself never turns raw HTML into
 * markup. If the host does not expose the renderer, the TeX source is shown
 * with an explicit "not typeset" note — never a hand-made formula imitation.
 */
export function HostMath({ tex, display }: MathRendererProps): ReactNode {
  const host = hostPrimitives()
  const MarkdownText = host?.MarkdownText
  const source = mathMarkdown(tex, display)
  if (MarkdownText === undefined) {
    return (
      <span
        className="lc-math-fallback"
        data-math-degraded="true"
        title="当前宿主未提供 KaTeX 渲染器；下面是公式源码，尚未排版。"
      >
        <code>{source}</code>
        <span className="lc-math-degraded-note">公式渲染器不可用，显示源码</span>
      </span>
    )
  }
  return <MarkdownText text={source} labels={HOST_LABELS} />
}
