'use strict';
// 只读窥探：从 Chrome / Edge 的 Local Storage (LevelDB) 里提取工作台状态，用于备份与排查。
// 不写入、不修改浏览器数据；只在内存里解析并打印/另存。
//
// 用法：
//   node scripts/peek-worktable-storage.cjs
//   node scripts/peek-worktable-storage.cjs --save data/backup
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KEYS = ['dsh.worktable.projects.v1', 'dsh.worktable.view.v1', 'dsh.worktable.mountedWidget.v2', 'dsh.worktable.pendingMount.v2'];
const BASES = [
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data'),
];

function saveDir() {
  const i = process.argv.indexOf('--save');
  if (i < 0) return null;
  const v = process.argv[i + 1];
  return v ? path.resolve(ROOT, v) : path.join(ROOT, 'data', 'backup');
}

function listStores() {
  const out = [];
  for (const base of BASES) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const lv = path.join(base, entry.name, 'Local Storage', 'leveldb');
      if (!fs.existsSync(lv)) continue;
      const files = fs.readdirSync(lv).filter((f) => /\.(log|ldb)$/i.test(f) || f === 'CURRENT');
      const stats = files.map((f) => fs.statSync(path.join(lv, f)));
      const last = stats.length ? Math.max(...stats.map((s) => s.mtimeMs)) : 0;
      out.push({ browser: base.includes('Chrome') ? 'chrome' : 'edge', profile: entry.name, dir: lv, last });
    }
  }
  return out.sort((a, b) => b.last - a.last);
}

function decodeAt(buf, pos, encoding) {
  if (encoding === 'utf16le') {
    // 从 pos 起按 UTF-16LE 解码，遇到连续两个 \x00 之外的控制字符也保留
    return buf.slice(pos, Math.min(buf.length, pos + 4 * 1024 * 1024)).toString('utf16le');
  }
  return buf.slice(pos, Math.min(buf.length, pos + 4 * 1024 * 1024)).toString('utf8');
}

function extractJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function searchInFile(file, key) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  const needles = [
    { buf: Buffer.from(key, 'utf16le'), enc: 'utf16le' },
    { buf: Buffer.from(key, 'utf8'), enc: 'utf8' },
  ];
  for (const n of needles) {
    let idx = buf.indexOf(n.buf);
    while (idx >= 0) {
      const text = decodeAt(buf, idx, n.enc);
      const json = extractJson(text);
      if (json) {
        try {
          return { json: JSON.parse(json), raw: json, file, enc: n.enc };
        } catch { /* 继续找下一处 */ }
      }
      idx = buf.indexOf(n.buf, idx + 2);
    }
  }
  return null;
}

function main() {
  const stores = listStores();
  if (!stores.length) { console.log('没有找到浏览器 Local Storage 目录'); process.exit(1); }
  console.log('候选存储（按最近写入排序）：');
  stores.forEach((s, i) => console.log(`  [${i}] ${s.profile} (${s.browser})  ${new Date(s.last).toLocaleString()}  ${s.dir}`));

  const dirFilesOf = (dir) => fs.readdirSync(dir)
    .filter((f) => /\.(log|ldb)$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const outDir = saveDir();
  let found = 0;
  for (const key of KEYS) {
    let hit = null;
    let usedStore = null;
    for (const store of stores) {
      for (const file of dirFilesOf(store.dir)) {
        hit = searchInFile(file, key);
        if (hit) { usedStore = store; break; }
      }
      if (hit) break;
    }
    if (!hit) { console.log(`\n- ${key}: 未在 LevelDB 中找到（可能还在内存未落盘，或该键不存在）`); continue; }
    found++;
    const preview = JSON.stringify(hit.json);
    console.log(`\n- ${key}: 命中 ${usedStore.profile}(${usedStore.browser}) / ${path.basename(hit.file)} (${hit.enc})，${preview.length} 字符`);
    console.log('  预览：' + preview.slice(0, 600) + (preview.length > 600 ? ' …' : ''));
    if (key === 'dsh.worktable.projects.v1' && hit.json) {
      const lay = (hit.json.layouts || []).map((l) => ({
        id: l.id, title: l.title,
        top: (l.top || []).length, main: (l.main || []).length,
        panes: [...(l.top || []), ...(l.main || [])].map((p) => p.title || p.id),
      }));
      console.log('  布局概览：' + JSON.stringify(lay));
      if (hit.json.views) console.log('  views：' + JSON.stringify(Object.keys(hit.json.views)).slice(0, 400));
    }
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const f = path.join(outDir, key + '.json');
      fs.writeFileSync(f, JSON.stringify(hit.json, null, 2), 'utf8');
      console.log(`  已备份：${f}`);
    }
  }
  console.log(found ? `\n共提取 ${found} 个键（只读，未修改浏览器数据）` : '\n没有提取到任何键');
}

main();
