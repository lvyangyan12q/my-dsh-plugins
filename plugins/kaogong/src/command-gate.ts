import { AsyncLocalStorage } from 'node:async_hooks'
/** One app-owned lease; external native calls cannot inherit a source's internal reentrant authority. */
export class CommandGate {
  private tail: Promise<unknown> = Promise.resolve()
  private scope = new AsyncLocalStorage<{ active: boolean }>()
  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.scope.getStore()?.active) return operation()
    const result = this.tail.then(async () => {
      const lease = { active: true }
      try { return await this.scope.run(lease, operation) } finally { lease.active = false }
    })
    this.tail = result.catch(() => {})
    return result
  }
  external<T>(operation: () => Promise<T>): Promise<T> { return this.scope.exit(() => this.run(operation)) }
}
