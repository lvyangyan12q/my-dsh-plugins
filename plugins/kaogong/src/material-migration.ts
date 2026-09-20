import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { recordDigest } from './material-repair.ts'
import type { BankQuestionRecord } from './types.ts'

export const MATERIAL_MIGRATION_TAG = 'mineru-material-v1'
interface BankTable {
  entries(): Iterable<[string, BankQuestionRecord]>
  get(id: string): BankQuestionRecord | undefined
  put(id: string, record: BankQuestionRecord): Promise<unknown>
}

export async function migrateMaterials(root: string, bank: BankTable): Promise<void> {
  let plan: any
  try { plan = JSON.parse(await readFile(resolve(root, 'material-repair-plan.json'), 'utf8')) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e }
  if (plan.version !== 1 || !Array.isArray(plan.rows)) throw new Error('Invalid material repair plan')
  const pending = plan.rows.filter((row: any) => !bank.get(row.id)?.tags.includes(MATERIAL_MIGRATION_TAG))
  if (!pending.length) return
  for (const row of pending) {
    const current = bank.get(row.id)
    if (!current || current.subject !== '行测-资料分析' || recordDigest(current) !== row.expectedHash) {
      throw new Error('Material repair snapshot changed: regenerate repair-materials.mjs before applying')
    }
    if (!['matched', 'unmatched', 'ambiguous'].includes(row.state) || (row.state === 'matched' && !row.stem)) throw new Error('Invalid repair row')
  }
  const backupDir = resolve(root, 'bank-backups')
  await mkdir(backupDir, { recursive: true })
  const backup = resolve(backupDir, Date.now() + '.json')
  await writeFile(backup, JSON.stringify({ createdAt: new Date().toISOString(), records: Object.fromEntries(bank.entries()) }), { flag: 'wx' })
  let matched = 0, paused = 0
  for (const row of pending) {
    const old = bank.get(row.id)!
    const verified = row.state === 'matched'
    await bank.put(row.id, {
      ...old,
      stem: verified ? row.stem : old.stem,
      reviewStatus: verified ? old.reviewStatus : old.reviewStatus === 'rejected' ? 'rejected' : 'pending',
      reviewNotes: verified
        ? `MinerU题本材料、题干及四选项一致；来源 ${row.source}；材料组 ${row.group + 1}，题号 ${row.number}。答案沿用原记录，未重新求解。`
        : `暂停抽取：MinerU题本未唯一匹配（${row.state}），原题干与记录已保留。`,
      tags: [...old.tags, MATERIAL_MIGRATION_TAG, verified ? 'mineru-material-matched' : 'mineru-material-pending'],
    })
    if (verified) matched++; else paused++
  }
  await writeFile(resolve(root, 'material-repair-result.json'), JSON.stringify({ matched, paused, backup, completedAt: new Date().toISOString() }, null, 2))
}
