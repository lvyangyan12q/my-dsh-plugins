/**
 * Manual run trigger for the host route.
 *
 * The route starts one detached `backfill-days.mjs` child and reports its
 * progress. The child is detached with ignored stdio so a DSH restart neither
 * kills a running backfill nor blocks on its pipes; the in-memory state is
 * advisory (a restart simply forgets it while the child finishes on disk).
 */
import { spawn } from 'node:child_process'

/**
 * @param {object} options
 * @param {string} options.scriptPath absolute path of backfill-days.mjs
 * @param {string} options.cwd working directory for the child
 * @param {Function} [options.spawnImpl] injectable spawn (tests)
 * @param {string} [options.execPath] node binary (defaults to this process)
 * @param {Function} [options.now] clock (tests)
 */
export function createRunTrigger({
  scriptPath,
  cwd,
  spawnImpl = spawn,
  execPath = process.execPath,
  now = () => new Date(),
} = {}) {
  let current = null

  const state = () => (current
    ? { ...current }
    : { running: false, pid: null, startedAt: null, finishedAt: null, exitCode: null })

  return {
    /** Start a run; `started` is false when one is already going. */
    start() {
      if (current?.running) return { started: false, run: state() }
      const child = spawnImpl(execPath, [scriptPath], {
        cwd,
        stdio: 'ignore',
        detached: true,
      })
      if (typeof child.unref === 'function') child.unref()
      current = {
        running: true,
        pid: typeof child.pid === 'number' ? child.pid : null,
        startedAt: now().toISOString(),
        finishedAt: null,
        exitCode: null,
      }
      if (typeof child.on === 'function') {
        child.on('exit', (code) => {
          if (current?.running) {
            current = { ...current, running: false, finishedAt: now().toISOString(), exitCode: code ?? null }
          }
        })
        child.on('error', () => {
          if (current?.running) {
            current = { ...current, running: false, finishedAt: now().toISOString(), exitCode: null }
          }
        })
      }
      return { started: true, run: state() }
    },
    state,
  }
}
