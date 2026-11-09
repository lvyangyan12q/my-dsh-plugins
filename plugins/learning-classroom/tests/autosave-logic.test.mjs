import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDebouncer } from '../src/autosave.ts'

function fakeTimers() {
  let next = 0
  const jobs = new Map()
  return {
    timers: {
      setTimeout(run, delay) {
        next += 1
        jobs.set(next, { run, delay })
        return next
      },
      clearTimeout(handle) {
        jobs.delete(handle)
      },
    },
    pending: () => [...jobs.values()],
    runAll() {
      const due = [...jobs.values()]
      jobs.clear()
      for (const job of due) job.run()
    },
    count: () => jobs.size,
  }
}

test('防抖：连续编辑只保存最后一次，且按配置的延迟调度', () => {
  const clock = fakeTimers()
  const debouncer = createDebouncer(700, clock.timers)
  const saved = []
  debouncer.schedule(() => saved.push('第一次'))
  debouncer.schedule(() => saved.push('第二次'))
  debouncer.schedule(() => saved.push('第三次'))

  assert.equal(clock.count(), 1)
  assert.equal(clock.pending()[0].delay, 700)
  assert.deepEqual(saved, [])

  clock.runAll()
  assert.deepEqual(saved, ['第三次'])
  assert.equal(debouncer.pending(), false)
})

test('防抖：flush 立即执行待保存内容，cancel 丢弃且不执行', () => {
  const clock = fakeTimers()
  const debouncer = createDebouncer(700, clock.timers)
  const saved = []
  debouncer.schedule(() => saved.push('待保存'))
  debouncer.flush()
  assert.deepEqual(saved, ['待保存'])
  assert.equal(clock.count(), 0)
  assert.equal(debouncer.pending(), false)
  clock.runAll()
  assert.deepEqual(saved, ['待保存'])

  debouncer.schedule(() => saved.push('应丢弃'))
  debouncer.cancel()
  clock.runAll()
  assert.deepEqual(saved, ['待保存'])
  assert.equal(debouncer.pending(), false)
})
