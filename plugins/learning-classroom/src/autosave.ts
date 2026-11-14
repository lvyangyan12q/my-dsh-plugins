/** Injectable timer seam so debounce behavior is unit-testable without sleeping. */
export interface SerialQueue {
  /** Queue one task; it starts only after every earlier task settled. */
  run<T>(task: () => Promise<T>): Promise<T>
}

/**
 * Serial task queue for note saves. It orders writes inside this panel only;
 * it is not a cross-process lock, so an external editor can still race between
 * the version check and the atomic rename on the Host.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task)
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
}

export interface DebounceTimers {
  setTimeout(run: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface Debouncer {
  /** Replace any pending job and restart the delay. */
  schedule(job: () => void): void
  /** Drop the pending job without running it. */
  cancel(): void
  /** Run the pending job immediately (used when leaving the editor). */
  flush(): void
  pending(): boolean
}

const defaultTimers: DebounceTimers = {
  setTimeout: (run, delayMs) => globalThis.setTimeout(run, delayMs),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Trailing-edge debounce for autosave: the editor reports every keystroke and
 * only the last state is written once typing pauses.
 */
export function createDebouncer(delayMs: number, timers: DebounceTimers = defaultTimers): Debouncer {
  let timer: unknown
  let job: (() => void) | undefined

  const clear = () => {
    if (timer !== undefined) {
      timers.clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    schedule(next) {
      clear()
      job = next
      timer = timers.setTimeout(() => {
        timer = undefined
        const run = job
        job = undefined
        run?.()
      }, delayMs)
    },
    cancel() {
      clear()
      job = undefined
    },
    flush() {
      clear()
      const run = job
      job = undefined
      run?.()
    },
    pending: () => job !== undefined,
  }
}
