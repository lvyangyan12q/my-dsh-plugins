import { buildAnnotationBlock } from './annotations.ts'
import type { LinkResolveCommand, LinkResolveView } from './contract.ts'
import { vaultRelativePath } from './vault-paths.ts'

/** A selection captured from the lecture body, before it becomes a note block. */
export interface AnnotationSourceInput {
  /** Space-relative lecture path, e.g. `讲义/第一章/01.md`. */
  path: string
  /** Lecture title, used only for messages. */
  title: string
  /** Plain-text excerpt, already read from the lecture selection. */
  excerpt: string
  truncated: boolean
  /** Nearest real heading before the selection, or null. */
  heading: string | null
}

export interface AnnotationFlowResult {
  ok: boolean
  /** Markdown block to append; present only when ok. */
  block?: string
  /** Canonical source link actually used. */
  link?: string
  /** Success notice, fallback warning, or the refusal reason. */
  message: string
}

export interface LinkResolverClient {
  resolveLink?: (input: LinkResolveCommand) => Promise<LinkResolveView>
}

const successMessage = '已把选段与来源追加到当前笔记末尾，正在保存。'

/**
 * Resolve a lecture selection's source link through the Host, then build the
 * annotation block. A heading is only used when the Host confirms it exists; if
 * it does not, the real file link plus the saved excerpt is used instead. A
 * missing lecture, an invalid path, or a client without the Host seam fails
 * honestly and never fabricates a heading or block anchor.
 */
export async function annotationBlockFor(
  client: LinkResolverClient,
  spaceId: string,
  spaceDirectory: string,
  input: AnnotationSourceInput,
): Promise<AnnotationFlowResult> {
  let relative: string
  try {
    relative = vaultRelativePath(input.path)
  } catch {
    return { ok: false, message: `讲义路径不是学习空间内的相对路径：${input.path}` }
  }
  let target: string
  try {
    target = vaultRelativePath(`${spaceDirectory}/${relative}`)
  } catch {
    return { ok: false, message: `讲义路径越出知识文件库授权范围：${input.path}` }
  }
  if (client.resolveLink === undefined) {
    return { ok: false, message: '当前客户端不支持双链解析，无法确认真实来源；批注没有追加。' }
  }
  const resolve = client.resolveLink

  const heading = input.heading === null || input.heading.trim() === '' ? null : input.heading.trim()
  let resolved = await resolve({
    action: 'link-resolve',
    spaceId,
    target: heading === null ? target : `${target}#${heading}`,
    // No fromPath: the lecture path is already Vault-relative.
  })

  let warning = ''
  if (resolved.status !== 'ok' && heading !== null) {
    // The heading did not resolve to a real heading (or cannot be represented).
    // Fall back to the file link: the excerpt is still worth keeping, and a
    // guessed anchor is exactly what this ticket forbids.
    const withHeadingMessage = resolved.message ?? ''
    resolved = await resolve({ action: 'link-resolve', spaceId, target })
    if (resolved.status === 'ok') {
      warning = `标题没有在讲义里确认（${withHeadingMessage}）；已改用真实文件链接，摘录仍保留。`
    }
  }

  if (resolved.status !== 'ok' || resolved.link === null) {
    return { ok: false, message: resolved.message ?? `无法确认讲义的真实来源：${input.path}` }
  }

  let block: string
  try {
    block = buildAnnotationBlock({ excerpt: input.excerpt, link: resolved.link, truncated: input.truncated })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '批注内容为空。' }
  }
  return {
    ok: true,
    block,
    link: resolved.link,
    message: warning === '' ? successMessage : `${warning}`,
  }
}
