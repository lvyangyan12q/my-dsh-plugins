import { createHash } from 'node:crypto'

export function recordDigest(record: object): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))))).digest('hex')
}

export interface MaterialQuestion {
  source: string
  group: number
  number: number
  material: string
  stem: string
  options: string[]
}

export function normalizeQuestion(text: string): string {
  return text.normalize('NFKC')
    .replace(/公考最新资料、更新进度微信\s*SKA674/g, '')
    .replace(/\\(?:sim|approx)/g, '~').replace(/[～~—–－−]/g, '-')
    .replace(/\\(?:mathrm|text|left|right|quad|qquad|%)/g, m => m === '\\%' ? '%' : '')
    .replace(/(?<!\d)\.|\.(?!\d)/g, '')
    .replace(/[^\p{Script=Han}a-zA-Z0-9.%+\-<>=/]/gu, '').toLowerCase()
}

export function parseMaterials(markdown: string, source: string): MaterialQuestion[] {
  const headers = [...markdown.matchAll(/^(?:#{1,6}\s*)?[一二三四五六七八九十]+[、.．]\s*根据[^\n]*$/gm)]
  const result: MaterialQuestion[] = []
  for (let g = 0; g < headers.length; g++) {
    const header = headers[g]
    const range = /回答\s*\$?\s*(\d+)\D+(\d+)\s*\$?\s*题/.exec(header[0])
    if (!range) continue
    const first = Number(range[1]), last = Number(range[2])
    if (last - first !== 4) continue
    const block = markdown.slice(header.index! + header[0].length, headers[g + 1]?.index ?? markdown.length)
    const starts = [...block.matchAll(/^(?:#{1,6}\s*)?(\d{1,3})[.．、]\s*/gm)]
      .filter(s => Number(s[1]) >= first && Number(s[1]) <= last)
    if (starts.length !== 5 || starts.some((s, i) => Number(s[1]) !== first + i)) continue
    const material = block.slice(0, starts[0].index)
      .replace(/^#{0,6}\s*请回答[^\n]*$/gm, '').trim()
    if (normalizeQuestion(material).length < 50 || /【解析】|【答案】/.test(material)) continue
    const group: MaterialQuestion[] = []
    for (let i = 0; i < starts.length; i++) {
      let content = block.slice(starts[i].index! + starts[i][0].length, starts[i + 1]?.index ?? block.length)
      // Chapter headings after the last option belong to the next material, not option D.
      content = content.replace(/\n#{1,6}\s[^]*$/, '').trim()
      const options = [...content.matchAll(/([ABCD])[.．、]\s*/g)]
      if (options.length !== 4 || options.some((o, n) => o[1] !== 'ABCD'[n])) break
      const stem = content.slice(0, options[0].index).trim()
      const choices = options.map((o, n) => content.slice(o.index! + o[0].length, options[n + 1]?.index ?? content.length).trim())
      if (!stem || choices.some(c => !c)) break
      group.push({ source, group: g, number: first + i, material, stem, options: choices })
    }
    if (group.length === 5) result.push(...group)
  }
  return result
}

export function matchMaterial(question: { stem: string; options: string[]; source: string }, candidates: MaterialQuestion[]): MaterialQuestion[] {
  if (question.options.length !== 4) return []
  const lines = question.stem.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('!['))
  const stem = normalizeQuestion(lines.at(-1) ?? '')
  const options = question.options.map(o => normalizeQuestion(o.replace(/^\s*[ABCD][.．、]\s*/, '')))
  const oldMaterial = normalizeQuestion(lines.slice(0, -1).join('\n'))
  return candidates.filter(c => {
    if (/1200/.test(question.source) && !/1200/.test(c.source)) return false
    if (/600/.test(question.source) && !/600/.test(c.source)) return false
    if (normalizeQuestion(c.stem) !== stem || c.options.some((o, i) => normalizeQuestion(o) !== options[i])) return false
    // Text evidence anchors the shared material even for generic stems/options (e.g. 1/2/3/4).
    const material = normalizeQuestion(c.material.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/<[^>]+>/g, ''))
    let hits = 0
    for (let i = 0; i + 24 <= Math.min(material.length, 600); i += 24) {
      if (oldMaterial.includes(material.slice(i, i + 24))) hits++
    }
    return hits >= 2
  })
}
