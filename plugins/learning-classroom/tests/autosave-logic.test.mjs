import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDebouncer, createSerialQueue } from '../src/autosave.ts'

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

test('串行队列：前一个任务未完成时后一个不开始，失败也不阻断后续', async () => {
  const queue = createSerialQueue()
  const events = []
  let releaseFirst
  const first = queue.run(async () => {
    events.push('first:start')
    await new Promise(resolve => { releaseFirst = resolve })
    events.push('first:end')
    return 'first'
  })
  const second = queue.run(async () => {
    events.push('second:start')
    return 'second'
  })

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events, ['first:start'], '第一个保存未完成时第二个不应开始')

  releaseFirst()
  assert.equal(await first, 'first')
  assert.equal(await second, 'second')
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])

  const failing = queue.run(async () => { throw new Error('一次保存失败') })
  const after = queue.run(async () => 'after')
  await assert.rejects(failing, /一次保存失败/)
  assert.equal(await after, 'after', '失败的任务不阻断队列')
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
