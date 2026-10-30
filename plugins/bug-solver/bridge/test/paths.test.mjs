/**
 * 接缝：allowedRoots 路径校验 —— 只通过 `resolveAllowedPath` 观察结果；
 * 用真实临时目录验证绝对路径/存在性/realpath 前缀，不 mock fs。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { resolveAllowedPath } from '../lib/paths.js'

const base = mkdtempSync(join(tmpdir(), 'bs-paths-'))
const root = join(base, 'repo')
const sibling = join(base, 'other')
mkdirSync(root)
mkdirSync(sibling)
mkdirSync(join(root, 'packages', 'api'), { recursive: true })
writeFileSync(join(root, 'file.txt'), 'x')

after(() => rmSync(base, { recursive: true, force: true }))

const expectCode = (fn, code) => {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code)
    return true
  })
}

test('accepts an absolute path inside a realpath-allowed root', () => {
  assert.equal(resolveAllowedPath(root, [root]), realpathSync(root))
  assert.equal(resolveAllowedPath(join(root, 'packages', 'api'), [root]), realpathSync(join(root, 'packages', 'api')))
})

test('accepts roots declared with a trailing separator or as a subpath of one', () => {
  assert.equal(resolveAllowedPath(join(root, 'packages'), [root + '\\']), realpathSync(join(root, 'packages')))
})

test('rejects missing, empty, and non-string paths', () => {
  expectCode(() => resolveAllowedPath('', [root]), 'local-path-missing')
  expectCode(() => resolveAllowedPath('   ', [root]), 'local-path-missing')
  expectCode(() => resolveAllowedPath(null, [root]), 'local-path-missing')
})

test('rejects relative paths', () => {
  expectCode(() => resolveAllowedPath('repo/packages', [root]), 'local-path-not-absolute')
})

test('rejects paths that do not exist', () => {
  expectCode(() => resolveAllowedPath(join(root, 'nope'), [root]), 'local-path-not-found')
})

test('rejects files', () => {
  expectCode(() => resolveAllowedPath(join(root, 'file.txt'), [root]), 'local-path-not-directory')
})

test('rejects a sibling directory that only shares a string prefix', () => {
  expectCode(() => resolveAllowedPath(sibling, [root]), 'local-path-outside-allowed-roots')
})

test('rejects traversal out of the allowed root', () => {
  expectCode(() => resolveAllowedPath(join(root, '..', 'other'), [root]), 'local-path-outside-allowed-roots')
})

test('fails closed when no allowed root is configured', () => {
  expectCode(() => resolveAllowedPath(root, []), 'allowed-roots-not-configured')
  expectCode(() => resolveAllowedPath(root, undefined), 'allowed-roots-not-configured')
})
