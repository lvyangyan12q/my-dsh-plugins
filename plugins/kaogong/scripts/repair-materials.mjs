import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { parseMaterials, matchMaterial, recordDigest } from '../src/material-repair.ts'

const root = resolve(import.meta.dirname, '../storage/mineru')
const manifest = JSON.parse(await readFile(resolve(root, 'rebuild-manifest.json'), 'utf8'))
const candidates = []
for (const doc of manifest.documents.filter(d => /资料分析/.test(d.file) && /题本/.test(d.file))) {
  let markdown = ''
  for (const job of doc.jobs) {
    if (job.state !== 'done') throw new Error('Source not fully parsed')
    markdown += '\n' + await readFile(resolve(root, job.id, 'knowledge.md'), 'utf8')
  }
  const parsed = parseMaterials(markdown, doc.file)
  candidates.push(...parsed)
  console.log(JSON.stringify({ source: doc.file, parsedQuestions: parsed.length }))
}
const bank = JSON.parse(await readFile(resolve(homedir(), '.dsh/storages/kaogong_bank.json'), 'utf8')).tables.questions
const rows = []
for (const [id, q] of Object.entries(bank)) {
  if (q.subject !== '行测-资料分析') continue
  const matches = matchMaterial(q, candidates)
  const match = matches.length === 1 ? matches[0] : undefined
  rows.push({ id, expectedHash: recordDigest(q),
    state: match ? 'matched' : matches.length ? 'ambiguous' : 'unmatched',
    ...(match ? { stem: '【材料】\n\n' + match.material + '\n\n' + match.stem, source: match.source, number: match.number, group: match.group } : {}),
  })
}
await writeFile(resolve(root, 'material-repair-plan.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), rows }, null, 2))
console.log(JSON.stringify({ total: rows.length, matched: rows.filter(r => r.state === 'matched').length, ambiguous: rows.filter(r => r.state === 'ambiguous').length, unmatched: rows.filter(r => r.state === 'unmatched').length, images: rows.filter(r=>r.stem?.includes('![')).length, tables: rows.filter(r=>r.stem?.includes('<table')).length }))
