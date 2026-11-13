/**
 * Public DSH native-file-open seam for the classroom.
 *
 * The classroom never imports a desktop or Electron API and never fabricates a
 * button for a capability the current Host did not report. It probes the public
 * `remote.session.canOpenWorkspacePath` / `openWorkspacePath` pair, which the
 * Session controller documents as the Host-side authenticated native opener.
 * When either method is absent (another Host composition, a plain browser, a
 * remote desktop without an opener) the caller gets an honest reason and must
 * show a path/Obsidian fallback instead of an inert control.
 */
export interface NativeOpenProbe {
  available: boolean
  reason: string | null
}

export interface NativeOpenResult {
  ok: boolean
  reason: string | null
}

export interface NativeOpenSeam {
  probe(): Promise<NativeOpenProbe>
  open(path: string): Promise<NativeOpenResult>
}

interface RemoteFailureLike {
  code?: unknown
  message?: unknown
}

interface RemoteResultLike<T> {
  ok?: unknown
  value?: unknown
  error?: RemoteFailureLike
}

interface SessionOpenRemoteLike {
  canOpenWorkspacePath?: () => Promise<RemoteResultLike<boolean>>
  openWorkspacePath?: (
    request: { path: string },
    signal?: AbortSignal,
  ) => Promise<RemoteResultLike<{ opened?: unknown }>>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A short, honest description of one Remote failure; the Host message is kept. */
function remoteFailure(error: RemoteFailureLike | undefined): string {
  if (error === undefined) return '宿主没有返回原因。'
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' && error.message !== '' ? error.message : ''
  if (message === '') return code === '' ? '宿主没有返回原因。' : `宿主错误码：${code}`
  return code === '' ? message : `${message}（${code}）`
}

/**
 * The public `remote.session` namespace service itself. `ctx.remote.session`
 * must not be reached through the parent `remote` proxy: that property requires
 * `remote.session` in the calling plugin's inject, so the classroom resolves the
 * namespace service directly with `ctx.get('remote.session')`.
 */
function sessionNamespace(value: unknown): SessionOpenRemoteLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const session = value as SessionOpenRemoteLike
  if (typeof session.canOpenWorkspacePath !== 'function' && typeof session.openWorkspacePath !== 'function') {
    return undefined
  }
  return session
}

/**
 * Build the capability seam over a public `remote.session` service source.
 * Resolution happens on every call so a plugin that started before the Remote
 * namespace became ready can still discover the capability later.
 */
export function createNativeOpenSeam(sessionSource: () => unknown): NativeOpenSeam {
  const capability = (): { session: SessionOpenRemoteLike } | { reason: string } => {
    let source: unknown
    try {
      source = sessionSource()
    } catch (error) {
      return { reason: `无法访问 DSH Session Remote 服务：${messageOf(error)}` }
    }
    if (source === undefined || source === null) {
      return { reason: '当前宿主没有提供公开的 Session Remote（remote.session），无法使用原生文件打开。' }
    }
    const session = sessionNamespace(source)
    if (session === undefined) {
      return { reason: '当前宿主没有提供公开的 Session Remote（remote.session），无法使用原生文件打开。' }
    }
    if (typeof session.canOpenWorkspacePath !== 'function') {
      return { reason: '当前宿主没有公开的原生打开能力探测（canOpenWorkspacePath）。' }
    }
    if (typeof session.openWorkspacePath !== 'function') {
      return { reason: '当前宿主没有公开的原生文件打开方法（openWorkspacePath）。' }
    }
    return { session }
  }

  return {
    async probe(): Promise<NativeOpenProbe> {
      const found = capability()
      if ('reason' in found) return { available: false, reason: found.reason }
      try {
        const result = await found.session.canOpenWorkspacePath!()
        if (result === null || typeof result !== 'object' || result.ok !== true) {
          return { available: false, reason: `无法确认原生文件打开能力：${remoteFailure(result?.error)}` }
        }
        if (result.value !== true) {
          return { available: false, reason: '宿主报告当前环境没有可用的原生桌面打开方式（可能运行在远程或纯浏览器环境）。' }
        }
        return { available: true, reason: null }
      } catch (error) {
        return { available: false, reason: `探测原生文件打开能力失败：${messageOf(error)}` }
      }
    },

    async open(path: string): Promise<NativeOpenResult> {
      if (typeof path !== 'string' || path.trim() === '') {
        return { ok: false, reason: '没有可打开的文件路径。' }
      }
      const found = capability()
      if ('reason' in found) return { ok: false, reason: found.reason }
      try {
        const result = await found.session.openWorkspacePath!({ path })
        if (result !== null && typeof result === 'object' && result.ok === true) {
          return { ok: true, reason: null }
        }
        return { ok: false, reason: `原生文件打开失败：${remoteFailure(result?.error)}` }
      } catch (error) {
        return { ok: false, reason: `原生文件打开失败：${messageOf(error)}` }
      }
    },
  }
}

/**
 * Join the explicitly chosen vault root with a vault-relative path for the Host
 * opener and display. Rejects an empty root and traversal: the absolute string is
 * only a display/request input, never a second authorization boundary.
 */
export function absoluteVaultPath(vaultRoot: string | null | undefined, relativePath: string): string | null {
  if (typeof vaultRoot !== 'string' || vaultRoot.trim() === '') return null
  if (typeof relativePath !== 'string') return null
  const root = vaultRoot.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  const relative = relativePath.trim().replaceAll('\\', '/').replace(/^\/+/, '')
  if (root === '' || relative === '') return null
  const segments = relative.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return null
  return `${root}/${segments.join('/')}`
}
