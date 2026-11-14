import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRunTrigger } from '../src/run-trigger.js'

/** A fake detached child capturing exit/error listeners. */
function fakeChild() {
  const listeners = {}
  return {
    pid: 4242,
    unref() { this.unrefed = true },
    on(event, handler) { listeners[event] = handler },
    emit(event, code) { listeners[event]?.(code) },
    listeners,
  }
}

test('start spawns the backfill script detached and reports the running state', () => {
  const children = []
  const trigger = createRunTrigger({
    scriptPath: 'C:/plugin/scripts/backfill-week.mjs',
    cwd: 'C:/plugin',
    execPath: 'node.exe',
    spawnImpl: (execPath, args, options) => {
      children.push({ execPath, args, options })
      return fakeChild()
    },
    now: () => new Date('2026-11-09T06:00:00Z'),
  })

  const idle = trigger.state()
  assert.equal(idle.running, false)
  assert.equal(idle.startedAt, null)

  const { started, run } = trigger.start()
  assert.equal(started, true)
  assert.equal(run.running, true)
  assert.equal(run.pid, 4242)
  assert.equal(run.startedAt, '2026-11-09T06:00:00.000Z')
  assert.deepEqual(children, [{
    execPath: 'node.exe',
    args: ['C:/plugin/scripts/backfill-week.mjs'],
    options: { cwd: 'C:/plugin', stdio: 'ignore', detached: true },
  }])
})

test('a second start is refused while one is running, and exit clears the state', () => {
  const child = fakeChild()
  const trigger = createRunTrigger({
    scriptPath: 's.mjs',
    cwd: '.',
    spawnImpl: () => child,
    now: () => new Date('2026-11-09T06:00:00Z'),
  })

  trigger.start()
  const second = trigger.start()
  assert.equal(second.started, false)
  assert.equal(second.run.running, true)

  child.emit('exit', 0)
  const done = trigger.state()
  assert.equal(done.running, false)
  assert.equal(done.exitCode, 0)
  assert.equal(done.finishedAt, '2026-11-09T06:00:00.000Z')
})

test('a spawn error also ends the run', () => {
  const child = fakeChild()
  const trigger = createRunTrigger({ scriptPath: 's.mjs', cwd: '.', spawnImpl: () => child })
  trigger.start()
  child.emit('error', new Error('ENOENT'))
  assert.equal(trigger.state().running, false)
})
