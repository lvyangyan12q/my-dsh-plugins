import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const require = createRequire(new URL('../01_content/package.json', import.meta.url))
const {build} = require('esbuild')

// Exercise exported apply, rather than testing a source-text registration pattern.
// Cordis and WebServer are external system seams; injected framework owners stay
// unavailable so this test cannot open application stores or native Sessions.
test('unloading and reinstalling the plugin releases its routes and owned terminals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worktable-route-lifetime-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const fixture = `
      const state = globalThis.__worktableTerminalFixture;
      exports.WebSocketServer = class {
        constructor() { this.clients = new Set(); state.servers.push(this); }
        handleUpgrade(req, socket, head, callback) { this.clients.add(socket); callback(socket); }
        close() { this.closed = true; }
      };
      exports.spawn = () => {
        const term = { killed: false, listeners: 0, onData() { this.listeners++; return {dispose: () => this.listeners--}; },
          onExit() { this.listeners++; return {dispose: () => this.listeners--}; }, write() {}, resize() {}, kill() { this.killed = true; } };
        state.terminals.push(term); return term;
      };
    `
    for (const name of ['ws', 'node-pty']) {
      await mkdir(join(dir, 'node_modules', name), {recursive: true})
      await writeFile(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({name, main: 'index.cjs'}))
      await writeFile(join(dir, 'node_modules', name, 'index.cjs'), fixture)
    }
    const output = join(dir, 'plugin.mjs')
    await build({entryPoints: [fileURLToPath(new URL('../01_content/src/index.ts', import.meta.url))], outfile: output,
      bundle: true, platform: 'node', format: 'esm', external: ['@deepseek-ai/*'], loader: {'.css': 'text', '.html': 'text'}})
    const {apply} = await import(pathToFileURL(output))
    const state = globalThis.__worktableTerminalFixture = {servers: [], terminals: []}
    const routes = new Map(), upgrades = new Map()
    let admitted = true
    const add = (table, key, row) => {
      assert.equal(table.has(key), false, `duplicate route ${key}`)
      table.set(key, row)
      return () => table.delete(key)
    }
    const webServer = {register: row => add(routes, row.kind + ':' + row.path, row),
      registerUpgrade: row => add(upgrades, row.path, row)}
    const unrelatedRoute = {kind: 'exact', path: '/api/unrelated', handler() {}}
    webServer.register(unrelatedRoute)
    const activate = () => {
      const disposers = []
      const ctx = {webServer, get: key => key === 'connection' ? {admit: () => admitted ? {peer: {}} : {rejection: 403}} : undefined,
        inject() {}, logger: {info() {}, warn() {}}, effect(factory) { disposers.push(factory()) }}
      apply(ctx)
      return async () => { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') await dispose() }
    }
    let unload = activate()
    assert.ok(routes.has('exact:/api/worktable/health'))
    assert.ok(routes.has('exact:/api/worktable/fs'))
    assert.ok(routes.has('prefix:/api/worktable/site'))
    admitted = false
    let rejection = ''
    upgrades.get('/api/worktable/term').handler({url: '/api/worktable/term'}, {end(text) { rejection = text }}, Buffer.alloc(0))
    assert.match(rejection, /403/)
    assert.equal(state.terminals.length, 0, 'unadmitted connections must not create a terminal')
    admitted = true
    const socket = {listeners: new Map(), on(event, fn) { this.listeners.set(event, fn) },
      removeListener(event, fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event) },
      send() {}, close() { this.closed = true; this.listeners.get('close')?.() },
      terminate() { this.closed = true; this.listeners.get('close')?.() }}
    upgrades.get('/api/worktable/term').handler({url: '/api/worktable/term'}, socket, Buffer.alloc(0))
    assert.equal(state.terminals.length, 1)
    await unload()
    assert.deepEqual([...routes.values()], [unrelatedRoute], 'only this plugin HTTP handlers must disappear on unload')
    assert.equal(upgrades.size, 0, 'terminal admission must disappear on unload')
    assert.equal(socket.closed, true, 'only plugin-owned admitted sockets must close')
    assert.equal(state.terminals[0].killed, true, 'plugin-owned PTY must stop even after route removal')
    assert.equal(state.terminals[0].listeners, 0, 'PTY listeners belong to the plugin')
    assert.equal(socket.listeners.size, 0, 'socket handlers belong to the plugin')
    assert.equal(state.servers[0].closed, true)
    unload = activate()
    assert.ok(routes.has('exact:/api/worktable/health'), 'reinstall must register without a duplicate collision')
    await unload()
    assert.deepEqual([...routes.values()], [unrelatedRoute])
    assert.equal(upgrades.size, 0)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    delete globalThis.__worktableTerminalFixture
    await rm(dir, {recursive: true, force: true})
  }
})
