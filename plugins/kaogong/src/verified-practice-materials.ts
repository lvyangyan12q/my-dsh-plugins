import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const indexSchema = z.object({
  version: z.literal(1),
  associations: z.array(z.object({
    questionId: z.string().min(1).max(200),
    stemSha256: digest,
    asset: z.string().regex(/^verified\/[\p{L}\p{N}_-]+\.(?:png|jpg|jpeg|webp)$/iu),
    assetSha256: digest,
    sourcePdfSha256: digest,
    sourcePage: z.number().int().positive(),
  }).strict()).max(5000),
}).strict()
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const unchanged = (_id: string, stem: string) => stem

/** Read only manually verified, content-pinned supplements. Never edit the bank or score snapshots. */
export async function loadVerifiedPracticeMaterials(root?: string): Promise<(id: string, stem: string) => string> {
  if (!root || !isAbsolute(root)) return unchanged
  const directory = await realpath(root)
  const contained = async (file: string) => {
    const actual = await realpath(resolve(directory, file))
    const offset = relative(directory, actual)
    if (!offset || offset.startsWith('..') || isAbsolute(offset)) throw new Error('Verified material path escapes configured root')
    return actual
  }
  let indexPath: string
  try { indexPath = await contained('verified/associations.json') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return unchanged; throw error }
  if ((await stat(indexPath)).size > 1_000_000) throw new Error('Verified material index is too large')
  const bytes = await readFile(indexPath)
  if (bytes.length > 1_000_000) throw new Error('Verified material index is too large')
  const index = indexSchema.parse(JSON.parse(bytes.toString('utf8')))
  const associations = new Map<string, typeof index.associations[number]>()
  for (const row of index.associations) {
    if (associations.has(row.questionId)) throw new Error('Duplicate verified material question identity')
    const asset = await readFile(await contained(row.asset))
    if (sha(asset) !== row.assetSha256) throw new Error('Verified material image changed')
    associations.set(row.questionId, row)
  }
  return (id, stem) => {
    const row = associations.get(id)
    if (!row || sha(stem) !== row.stemSha256) return stem
    const reference = `![已核验原题图示 · PDF 第 ${row.sourcePage} 页](题目_images/${row.asset})`
    return stem.includes(reference) ? stem : stem + '\n\n' + reference
  }
}
