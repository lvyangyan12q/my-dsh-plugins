import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createMaterialLocationIO } from '../src/material-location-map.mjs'

test('relocation uses only pinned aliases, rejects changed bytes and keeps the original untouched', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kaogong-location-'))
  const original = path.join(root, 'original.pdf'), copy = path.join(root, 'copy.pdf')
  try {
    await fs.writeFile(original, '%PDF-original')
    await fs.writeFile(copy, '%PDF-original')
    const map = { format: 'kaogong-material-location-map', version: 1, root, sourceEvidenceHash: 'a'.repeat(64), aliases: [{ declaredPath: original, relativePath: 'copy.pdf', sha256: createHash('sha256').update('%PDF-original').digest('hex') }] }
    const io = await createMaterialLocationIO(map)
    assert.equal(await io.realpath(original), await fs.realpath(copy))
    assert.equal(await io.realpath(copy), await fs.realpath(copy))
    await fs.writeFile(copy, '%PDF-changed')
    await assert.rejects(io.realpath(original), /MATERIAL_LOCATION_CHANGED/)
    assert.equal(await fs.readFile(original, 'utf8'), '%PDF-original')
    await assert.rejects(createMaterialLocationIO({ ...map, aliases: [map.aliases[0], map.aliases[0]] }), /DUPLICATE/)
    await assert.rejects(createMaterialLocationIO({ ...map, aliases: [{ ...map.aliases[0], relativePath: '../outside.pdf' }] }), /INVALID_MATERIAL_LOCATION_ALIAS/)
  } finally {
    await fs.unlink(original).catch(() => {})
    await fs.unlink(copy).catch(() => {})
    await fs.rmdir(root)
  }
})
