/**
 * 版本化 run 表持久化：单个 `runs.json`，原子写（tmp + rename），写操作串行化。
 * 数据目录由调用方注入（项目数据目录），不碰目标仓库的 data。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BridgeError } from './errors.js'

export const STORE_VERSION = 1

const clone = (value) => structuredClone(value)

/**
 * @param {{ dir: string }} options
 */
export function createRunStore({ dir }) {
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new BridgeError('store/no-dir', 'RunStore 需要数据目录', { status: 500 })
  }

  const file = join(dir, 'runs.json')
  const runsDir = join(dir, 'runs')
  let data = null
  let loading = null
  let writeChain = Promise.resolve()

  async function load() {
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        data = { version: STORE_VERSION, runs: {} }
        return
      }
      throw new BridgeError('store/read-failed', `读取 run 表失败：${error?.message ?? error}`, { status: 500 })
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new BridgeError('store/corrupt', `run 表不是合法 JSON：${file}`, { status: 500 })
    }
    if (parsed?.version !== STORE_VERSION) {
      throw new BridgeError('store/bad-version', `run 表版本不支持：${String(parsed?.version)}`, {
        status: 500,
        details: { expected: STORE_VERSION },
      })
    }
    if (!parsed.runs || typeof parsed.runs !== 'object') {
      throw new BridgeError('store/corrupt', `run 表缺少 runs 对象：${file}`, { status: 500 })
    }
    data = parsed
  }

  function ready() {
    loading ??= load()
    return loading
  }

  function persist() {
    writeChain = writeChain.then(async () => {
      await mkdir(dir, { recursive: true })
      const body = JSON.stringify(data, null, 2)
      const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
      try {
        await writeFile(tmp, body, 'utf8')
        await rename(tmp, file)
      } finally {
        await rm(tmp, { force: true }).catch(() => {})
      }
    })
    return writeChain
  }

  async function get(id) {
    await ready()
    const run = data.runs[id]
    return run ? clone(run) : null
  }

  async function list() {
    await ready()
    return Object.values(data.runs).map(clone)
  }

  async function put(run) {
    if (!run || typeof run.id !== 'string' || run.id === '') {
      throw new BridgeError('store/bad-run', 'run 缺少 id', { status: 500 })
    }
    await ready()
    data.runs[run.id] = clone(run)
    await persist()
    return clone(run)
  }

  async function remove(id) {
    await ready()
    delete data.runs[id]
    await persist()
  }

  async function flush() {
    await ready()
    await writeChain
  }

  async function ensureRunDir(id) {
    const target = join(runsDir, id)
    await mkdir(target, { recursive: true })
    return target
  }

  return { dir, file, get, list, put, remove, flush, ensureRunDir }
}
