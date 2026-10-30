/**
 * 接缝：Redactor —— 桥只暴露 `redact(text)`；测试只断言脱敏后的外部文本，
 * 不关心内部用了哪些正则。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRedactor } from '../lib/redact.js'

const redactor = createRedactor()

test('redacts key=value passwords while keeping the key', () => {
  assert.equal(redactor.redact('password=hunter2'), 'password=***')
  assert.equal(redactor.redact('PASSWD: s3cr3t'), 'PASSWD: ***')
  assert.equal(redactor.redact('"pwd": "abc"'), '"pwd": ***')
})

test('redacts quoted and bare secrets in Chinese text', () => {
  const out = redactor.redact('连接信息：密码：Hunter2；token: tok_123')
  assert.ok(!out.includes('Hunter2'))
  assert.ok(!out.includes('tok_123'))
  assert.ok(out.includes('***'))
})

test('redacts bearer credentials but keeps the scheme', () => {
  const out = redactor.redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig')
  assert.equal(out, 'Authorization: Bearer ***')
  // 普通授权说明不应被误伤
  assert.equal(redactor.redact('authorization 由 Host 校验'), 'authorization 由 Host 校验')
})

test('redacts credentials embedded in connection URLs', () => {
  assert.equal(
    redactor.redact('postgres://root:pa55word@db.internal:5432/app'),
    'postgres://root:***@db.internal:5432/app',
  )
})

test('redacts private key blocks entirely', () => {
  const text = [
    'key:',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA=',
    '-----END OPENSSH PRIVATE KEY-----',
    'done',
  ].join('\n')
  const out = redactor.redact(text)
  assert.equal(out.includes('b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA='), false)
  assert.ok(out.includes('[REDACTED PRIVATE KEY]'))
})

test('does not touch ordinary text, key paths, or words containing key', () => {
  const text = '服务重启后仍失败；keyPath: C:\\keys\\id_rsa；monkey=banana'
  assert.equal(redactor.redact(text), text)
})

test('non-string input becomes an empty string instead of throwing', () => {
  assert.equal(redactor.redact(null), '')
  assert.equal(redactor.redact(undefined), '')
  assert.equal(redactor.redact(42), '42')
})

test('redaction is idempotent for already-redacted text', () => {
  const once = redactor.redact('password=hunter2')
  assert.equal(redactor.redact(once), once)
})
