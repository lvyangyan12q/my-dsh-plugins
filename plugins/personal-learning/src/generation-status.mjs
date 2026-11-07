// Maps persisted generation requests to one user-visible status line.
// The lab page shows only the latest request; the drawer keeps the full history.

const TONES = { pending: 'muted', active: 'active', failed: 'no', done: 'ok' }

export function describeGeneration (rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const latest = rows[0]
  const status = latest.status

  if (status === 'withdrawn') return { label: '已撤回这次生成，旧课仍然保留', tone: TONES.pending }
  if (status === 'prepared') return { label: '请求已准备，尚未发送给老师', tone: TONES.pending }
  if (status === 'unknown') return { label: '正在核对生成状态，暂不重新提交', tone: TONES.pending }

  if (status === 'accepted') {
    if (latest.nativeStatus === 'failed') return { label: '老师生成失败，可以换一种说法后重试', tone: TONES.failed }
    if (latest.artifactStatus === 'submitted') return { label: '课程已提交，可以开始学习', tone: TONES.done }
    if (latest.nativeStatus === 'cancelled') return { label: '生成已取消，旧课不受影响', tone: TONES.failed }
    return { label: '老师正在生成课程…', tone: TONES.active }
  }

  return { label: '生成状态未知，请检查教学会话', tone: TONES.pending }
}
