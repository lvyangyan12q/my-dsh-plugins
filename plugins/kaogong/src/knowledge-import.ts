import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { Mineru } from './mineru.ts'
import type { KnowledgeEntryRecord } from './types.ts'

interface ImportTable {
  get(id: string): KnowledgeEntryRecord | undefined
  put(id: string, value: KnowledgeEntryRecord): Promise<unknown>
}

export async function importMineruKnowledge(mineru: Mineru, entries: ImportTable): Promise<number> {
  let manifest: any
  try { manifest = JSON.parse(await readFile(resolve(mineru.root(), 'rebuild-manifest.json'), 'utf8')) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw e }
  let imported = 0
  for (const doc of manifest.documents) {
    if (!/^[a-f0-9]{64}$/.test(doc.fingerprint)) throw new Error('Invalid knowledge manifest fingerprint')
    for (const job of doc.jobs) {
      if (job.state !== 'done') continue
      if (!/^\d+-\d+$/.test(job.pages)) throw new Error('Invalid knowledge manifest pages')
      const id = `mineru_${doc.fingerprint}_${job.pages}`
      const old = entries.get(id)
      if (old?.tags.includes('mineru-job:' + job.id)) continue
      const content = await readFile(resolve(mineru.jobDir(job.id), 'knowledge.md'), 'utf8')
      if (!content.trim()) throw new Error('Empty parsed knowledge document')
      const now = new Date().toISOString()
      await entries.put(id, {
        title: basename(doc.file) + ' [PDF ' + job.pages + ']',
        subject: doc.subject, knowledgePoint: '', kind: doc.kind,
        content, source: doc.file + '#pages=' + job.pages,
        tags: ['MinerU', '待校对', 'mineru-job:' + job.id],
        createdAt: old?.createdAt ?? now, updatedAt: now,
      })
      imported++
    }
  }
  return imported
}
