import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Workbench, constrainGeometry, windowKey } from '../src/workbench.ts'
import type { WorkbenchAppDefinition, WorkbenchAppId, WorkbenchInstanceId } from '../src/workbench-api.ts'

const app: WorkbenchAppDefinition = { id: 'test.lesson' as WorkbenchAppId, name: 'Lesson', version: '1.0', source: 'test plugin', icon: 'book-open',
  pages: [{ id: 'lesson', label: 'Lesson' }, { id: 'practice', label: 'Practice' }], defaultLayout: { width: 700, height: 500, pageId: 'lesson' } }
const instance = 'default' as WorkbenchInstanceId
const key = windowKey(app.id, instance)
function memory() {
  const values = new Map<string, string>()
  return { values, getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value) } }
}

test('registration uniqueness, observable publication and idempotent cleanup survive replacement', () => {
  const workbench = new Workbench()
  const initial = workbench.getSnapshot()
  let notifications = 0
  workbench.subscribe(() => { notifications++ })
  const dispose = workbench.registerApp(app)
  assert.notEqual(workbench.getSnapshot(), initial)
  assert.equal(workbench.getSnapshot(), workbench.getSnapshot())
  assert.equal(notifications, 1)
  assert.throws(() => workbench.registerApp(app), /Duplicate/)
  workbench.openApp(app.id)
  dispose(); dispose()
  assert.equal(workbench.getSnapshot().definitions.length, 0)
  assert.equal(workbench.getSnapshot().windows[0].mode, 'closed')
  assert.throws(() => workbench.openApp(app.id), /unavailable/)
  workbench.registerApp(app)
  dispose()
  assert.equal(workbench.getSnapshot().definitions.length, 1)
  workbench.dispose()
  assert.throws(() => workbench.registerApp(app), /disposed/)
  workbench.openWorkspace()
  assert.equal(workbench.getSnapshot().visible, false)
})

test('same instance focus, minimize/maximize/close/reopen and refresh preserve page and geometry preferences', () => {
  const storage = memory()
  const workbench = new Workbench(storage)
  workbench.registerApp(app)
  workbench.openApp(app.id)
  const revision = workbench.getSnapshot().focusRevision
  workbench.openApp(app.id)
  assert.equal(workbench.getSnapshot().windows.length, 1)
  assert.ok(workbench.getSnapshot().focusRevision > revision)
  workbench.selectPage(key, 'practice')
  workbench.setGeometry(key, { x: 50, y: 60, width: 620, height: 410 })
  workbench.setMode(key, 'maximized')
  workbench.setMode(key, 'minimized')
  workbench.openApp(app.id)
  assert.equal(workbench.getSnapshot().windows[0].mode, 'maximized')
  workbench.setMode(key, 'closed')
  workbench.openApp(app.id)
  assert.equal(workbench.getSnapshot().windows[0].pageId, 'practice')
  assert.equal(workbench.getSnapshot().windows[0].width, 620)
  workbench.setPreference(app.id, { favorite: true, hidden: true, order: 2 })
  const restored = new Workbench(storage)
  assert.equal(restored.getSnapshot().definitions.length, 0, 'registrations are never persisted')
  restored.registerApp(app)
  assert.equal(restored.getSnapshot().windows[0].mode, 'maximized')
  assert.equal(restored.getSnapshot().windows[0].pageId, 'practice')
  assert.equal(restored.getSnapshot().apps[app.id].favorite, true)
  assert.throws(() => restored.selectPage(key, 'missing'), /unavailable/)
  const persisted = JSON.parse([...storage.values.values()][0])
  assert.deepEqual(Object.keys(persisted).sort(), ['apps', 'version', 'visible', 'windows'])
  assert.equal(JSON.stringify(persisted).includes('source'), false)
})

test('two instance IDs cannot collide, and changed installed page IDs restore to declared defaults', () => {
  const storage = memory()
  const workbench = new Workbench(storage)
  workbench.registerApp(app)
  workbench.openApp(app.id, 'one' as WorkbenchInstanceId)
  workbench.openApp(app.id, 'two' as WorkbenchInstanceId)
  assert.equal(workbench.getSnapshot().windows.length, 2)
  workbench.selectPage(windowKey(app.id, 'one' as WorkbenchInstanceId), 'practice')
  const restored = new Workbench(storage)
  restored.registerApp({ ...app, pages: [{ id: 'new', label: 'New' }], defaultLayout: { ...app.defaultLayout, pageId: 'new' } })
  assert.deepEqual(restored.getSnapshot().windows.map(row => row.pageId), ['new', 'new'])
})

test('malformed/blocked storage stays usable, and listeners cannot starve later observers', () => {
  const workbench = new Workbench({ getItem: () => '{', setItem: () => { throw new Error('denied') } })
  assert.equal(workbench.getSnapshot().storageFailed, true)
  workbench.registerApp(app)
  workbench.openApp(app.id)
  assert.equal(workbench.getSnapshot().windows.length, 1)
  let observed = false
  const before = console.error
  console.error = () => {}
  try {
    workbench.subscribe(() => { throw new Error('observer') })
    workbench.subscribe(() => { observed = true })
    workbench.closeWorkspace()
    assert.equal(observed, true)
  } finally { console.error = before }
})

test('offscreen dimensions are constrained for desktop and tiny viewports', () => {
  for (const [width, height] of [[1200, 900], [390, 680], [200, 180]]) {
    const geometry = constrainGeometry({ x: -500, y: 10000, width: 3000, height: 5000 }, width, height)
    assert.ok(geometry.x >= 0 && geometry.y >= 0)
    assert.ok(geometry.x + geometry.width <= width && geometry.y + geometry.height <= height)
  }
})

test('only the active registration owner updates metadata without retiring instances', () => {
  const workbench = new Workbench()
  const dispose = workbench.registerApp(app)
  workbench.openApp(app.id)
  workbench.selectPage(key, 'practice')
  const focused = workbench.getSnapshot().focused
  const window = workbench.getSnapshot().windows[0]
  const next = { ...app, name: 'Updated', version: '2', pages: [{ id: 'lesson', label: 'Updated lesson' }] }
  dispose.update(next)
  assert.equal(workbench.getSnapshot().focused, focused)
  assert.equal(workbench.getSnapshot().windows[0].mode, window.mode)
  assert.equal(workbench.getSnapshot().windows[0].pageId, 'lesson')
  assert.equal(workbench.getSnapshot().definitions[0].name, 'Updated')
  const snapshot = workbench.getSnapshot()
  assert.throws(() => dispose.update({ ...next, id: 'other' as WorkbenchAppId }), /identity/)
  assert.throws(() => dispose.update({ ...next, pages: [] }), /pages/)
  assert.equal(workbench.getSnapshot(), snapshot)
  dispose()
  workbench.registerApp(app)
  assert.throws(() => dispose.update(next), /disposed/)
  assert.equal(workbench.getSnapshot().definitions[0].version, '1.0')
  workbench.dispose()
})
