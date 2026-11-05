/**
 * jsdom harness for the built client bundle.
 *
 * The client half is JSX plus a CSS text import, so rendering tests load the
 * real esbuild output (`lib/client.js`) exactly the way the DSH web host does:
 * through `window.__ModuleLoader__.load`, with react supplied as an external
 * module. Build the bundle first, or set ESBUILD_BIN and this helper rebuilds
 * when the sources are newer than the bundle.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireTestDeps } from './deps.mjs'

export const STORAGE_KEY = 'dsh-paper-reader:v1'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const bundlePath = join(root, 'lib', 'client.js')
const SOURCE_FILES = [
  'src/client/index.jsx',
  'src/client/styles.css',
  'src/shared/schema.js',
  'src/index.js',
]

function newestSourceMtime() {
  let newest = 0
  for (const file of SOURCE_FILES) {
    try {
      newest = Math.max(newest, statSync(join(root, file)).mtimeMs)
    } catch {
      // A source file may not exist yet while a slice is being written.
    }
  }
  return newest
}

/** Build lib/client.js when it is missing or older than its sources. */
export function ensureClientBundle() {
  let stale = true
  try {
    stale = newestSourceMtime() > statSync(bundlePath).mtimeMs
  } catch {
    stale = true
  }
  if (!stale) return
  if (!process.env.ESBUILD_BIN) {
    throw new Error('lib/client.js is missing or stale; run `node scripts/build-local.mjs` with ESBUILD_BIN set')
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'build-local.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) throw new Error('building lib/client.js failed')
}

/** A fresh browser document per test, with the globals React DOM expects. */
export function createBrowser() {
  const { JSDOM } = requireTestDeps('jsdom')
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:3080/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'localStorage',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent',
  ]) {
    if (window[key] === undefined) continue
    try {
      globalThis[key] = window[key]
    } catch {
      Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
    }
  }
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      media: '',
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false },
    })
  }
  return dom
}

/** Load the bundle through the host module-loader handshake. */
export function loadClientPlugin() {
  const window = globalThis.window
  if (!window) throw new Error('createBrowser() must run before loadClientPlugin()')
  const modules = {
    react: requireTestDeps('react'),
    'react/jsx-runtime': requireTestDeps('react/jsx-runtime'),
  }
  const code = readFileSync(bundlePath, 'utf8')
  let loaded = null
  window.__ModuleLoader__ = {
    load(entry) {
      loaded = entry.factory((name) => {
        if (!(name in modules)) throw new Error(`client bundle asked for an unknown external module: ${name}`)
        return modules[name]
      })
    },
  }
  try {
    // The bundle runs in the global scope, exactly like the host page does.
    new Function(code)()
  } finally {
    delete window.__ModuleLoader__
  }
  if (!loaded) throw new Error('lib/client.js did not register through __ModuleLoader__')
  return loaded
}

/**
 * Mount PaperReaderPage against a digest fixture and wait for the reader.
 *
 * `digest` answers every request with the same document (the pre-history
 * harness). `routes` maps an exact request path to a payload, a
 * `{ status, body }` response stub, or a function returning either; paths that
 * are not listed fall back to `digest`.
 *
 * `prefs` seeds localStorage before mount, which is how mode and the active
 * item are restored on first paint.
 */
export async function mountPage({ digest, routes, mode = 'both', prefs = {} } = {}) {
  ensureClientBundle()
  const dom = createBrowser()
  const { window } = dom
  const document = window.document

  const fetchCalls = []
  const fetchImpl = async (url) => {
    const path = String(url)
    fetchCalls.push(path)
    let value
    if (routes && Object.prototype.hasOwnProperty.call(routes, path)) {
      value = typeof routes[path] === 'function' ? await routes[path]() : routes[path]
      if (value instanceof Error) throw value
      if (value && typeof value === 'object' && 'status' in value && 'body' in value) {
        return {
          ok: value.status >= 200 && value.status < 300,
          status: value.status,
          json: async () => value.body,
        }
      }
    } else {
      value = digest
    }
    return { ok: true, status: 200, json: async () => value }
  }
  globalThis.fetch = fetchImpl
  window.fetch = fetchImpl

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, ...prefs }))

  const React = requireTestDeps('react')
  const { createRoot } = requireTestDeps('react-dom/client')
  const act = React.act ?? requireTestDeps('react-dom/test-utils').act
  const plugin = loadClientPlugin()
  const container = document.getElementById('root')
  const root = createRoot(container)

  const settle = async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })
    }
  }

  await act(async () => {
    root.render(React.createElement(plugin.PaperReaderPage))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  for (let attempt = 0; attempt < 20 && !container.querySelector('.pr-reader'); attempt += 1) {
    await settle()
  }
  await settle()

  const bodyText = () => container.querySelector('.pr-body')?.textContent ?? ''

  const click = async (element) => {
    await act(async () => {
      element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await settle()
  }

  return {
    container,
    document,
    window,
    plugin,
    fetchCalls,
    bodyText,
    click,
    settle,
    unmount: async () => {
      await act(async () => { root.unmount() })
      window.close()
    },
  }
}
