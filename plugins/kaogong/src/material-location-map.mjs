import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const key = value => path.resolve(value).toLowerCase()
const inside = (root, file) => { const relative = path.relative(root, file); return relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) }

/** Explicit offline relocation adapter. Original source metadata and proofs stay
 * byte-identical. Only individually pinned declared PDF aliases are redirected.
 * Callers must retain the map alongside the newly generated evidence. */
export async function createMaterialLocationIO(map, io = fs) {
  if (map?.format !== 'kaogong-material-location-map' || map.version !== 1 || !/^[a-f0-9]{64}$/.test(map.sourceEvidenceHash) || !path.isAbsolute(map.root) || !Array.isArray(map.aliases)) throw Error('INVALID_MATERIAL_LOCATION_MAP')
  const root = await io.realpath(map.root)
  const aliases = new Map()
  for (const alias of map.aliases) {
    if (!path.isAbsolute(alias.declaredPath) || !/^[a-f0-9]{64}$/.test(alias.sha256) || !inside(root, path.resolve(root, alias.relativePath)) || path.isAbsolute(alias.relativePath)) throw Error('INVALID_MATERIAL_LOCATION_ALIAS')
    if (aliases.has(key(alias.declaredPath))) throw Error('DUPLICATE_MATERIAL_LOCATION_ALIAS')
    aliases.set(key(alias.declaredPath), alias)
  }
  async function relocated(alias) {
    const file = await io.realpath(path.resolve(root, alias.relativePath))
    if (!inside(root, file) || sha(await io.readFile(file)) !== alias.sha256) throw Error('MATERIAL_LOCATION_CHANGED')
    return file
  }
  for (const alias of aliases.values()) await relocated(alias)
  return {
    ...io,
    realpath: async file => {
      const alias = typeof file === 'string' && aliases.get(key(file))
      return alias ? relocated(alias) : io.realpath(file)
    },
  }
}
