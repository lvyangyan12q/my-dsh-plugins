'use strict';
// 工作台布局文件工具：直接读写 <项目文件夹>\.dsh-worktable\layout-<项目ID>.json
//
// 需要 dsh-worktable ≥ 本仓库构建的版本（客户端支持「布局落盘」）：
//   打开项目时优先读该文件；窗格/尺寸变更后自动回写。
//
// 用法：
//   node scripts/worktable-layout.cjs show
//   node scripts/worktable-layout.cjs set --top 2 --main 1 --ratio 0.5
//   node scripts/worktable-layout.cjs set --top 1 --main 2 --title "bug-solver"
//   node scripts/worktable-layout.cjs rename-pane p3 "herdr"
//   node scripts/worktable-layout.cjs backup
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_ID = 'layout-30537acd-8ea2-480c-8835-ad12f95b748a';
const LAYOUT_DIR = path.join(ROOT, '.dsh-worktable');
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout-' + PROJECT_ID + '.json');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
}

function readFileSafe() {
  try { return JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8')); } catch { return null; }
}

function writeAtomic(obj) {
  fs.mkdirSync(LAYOUT_DIR, { recursive: true });
  const tmp = LAYOUT_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, LAYOUT_FILE);
}

function defaultSpec(topCount, mainCount, title, ratio) {
  const mk = (i) => ({ id: 'p' + (i + 1), title: '窗口' + (i + 1), min: 200, content: null });
  const top = Array.from({ length: topCount }, (_, i) => mk(i));
  const main = Array.from({ length: mainCount }, (_, i) => mk(topCount + i));
  return {
    id: PROJECT_ID,
    title,
    left: null,
    top: top.length ? top : null,
    main,
    leftWidth: { default: 260, min: 160, max: 480 },
    chatWidth: { default: 360, min: 240, max: 600 },
    topHeight: { default: 200, min: 120, max: 480 },
    topHeightRatio: ratio,
    chatSide: 'right',
    chatFullHeight: false,
  };
}

function show() {
  const data = readFileSafe();
  if (!data) { console.log('还没有布局文件：' + LAYOUT_FILE); return; }
  const s = data.spec || {};
  const all = [...(s.left ? [s.left] : []), ...(s.leftMore || []), ...(s.top || []), ...(s.main || [])];
  const panes = all.map((p) => `${p.id}:${p.title}`);
  console.log('文件：' + LAYOUT_FILE);
  console.log('保存时间：' + (data.savedAt || '?'));
  console.log('标题：' + (s.title || '?'));
  console.log('窗格：' + (panes.join(', ') || '（无）'));
  console.log('左列/顶行/主行：' + ((s.left ? 1 : 0) + (s.leftMore ? s.leftMore.length : 0)) + ' / ' + (s.top || []).length + ' / ' + (s.main || []).length
    + '，leftWidth=' + (s.leftWidth && s.leftWidth.default) + 'px，topHeight=' + (s.topHeight && s.topHeight.default) + 'px，chatWidth=' + (s.chatWidth && s.chatWidth.default) + 'px');
  for (const p of all) {
    const tabs = (p.tabs || []).map((t) => `${t.title}(${t.content && t.content.kind ? t.content.kind : '?'}${t.content && t.content.type ? ':' + t.content.type : ''})`);
    if (tabs.length) console.log(`  - ${p.id} 标签：${tabs.join(' | ')}`);
  }
}

function set() {
  const topCount = Number(arg('top', 2));
  const mainCount = Number(arg('main', 1));
  const ratio = Number(arg('ratio', 0.5));
  const title = String(arg('title', (readFileSafe() || {}).spec?.title || 'bug-solver'));
  if (!Number.isInteger(topCount) || !Number.isInteger(mainCount) || topCount < 0 || mainCount < 1) {
    console.error('参数不合法：--top 需要 >=0 的整数，--main 需要 >=1 的整数');
    process.exit(2);
  }
  if (!(ratio > 0.15 && ratio < 0.85)) {
    console.error('--ratio 需要在 0.15 ~ 0.85 之间（顶行高度占比）');
    process.exit(2);
  }
  const existing = readFileSafe();
  if (existing) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(LAYOUT_DIR, 'layout-backup-' + stamp + '.json'), JSON.stringify(existing, null, 2), 'utf8');
    console.log('已备份原布局到 layout-backup-' + stamp + '.json');
  }
  const spec = defaultSpec(topCount, mainCount, title, ratio);
  writeAtomic({ version: 1, projectId: PROJECT_ID, savedAt: new Date().toISOString(), spec });
  console.log(`已写入 ${topCount}+${mainCount} 窗布局（顶行 ${topCount}，主行 ${mainCount}，ratio ${ratio}）：${LAYOUT_FILE}`);
  console.log('窗格：' + [...(spec.top || []), ...spec.main].map((p) => p.id + ':' + p.title).join(', '));
  console.log('下一步：刷新工作台页面（若布局没变，需要重启 dsh web 让新插件 bundle 生效）。');
}

function renamePane() {
  const id = process.argv[3];
  const title = process.argv[4];
  if (!id || !title) { console.error('用法：rename-pane p3 "herdr"'); process.exit(2); }
  const data = readFileSafe();
  if (!data) { console.error('还没有布局文件，先运行 set'); process.exit(1); }
  let hit = false;
  for (const list of [data.spec.top || [], data.spec.main || []]) {
    for (const p of list) if (p.id === id) { p.title = title; hit = true; }
  }
  if (!hit) { console.error('没有找到窗格 ' + id); process.exit(1); }
  data.savedAt = new Date().toISOString();
  writeAtomic(data);
  console.log(`已把 ${id} 改名为「${title}」`);
}

function backup() {
  const data = readFileSafe();
  if (!data) { console.error('还没有布局文件'); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(LAYOUT_DIR, 'layout-backup-' + stamp + '.json');
  fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf8');
  console.log('已备份到 ' + out);
}

const cmd = process.argv[2];
if (cmd === 'show') show();
else if (cmd === 'set') set();
else if (cmd === 'rename-pane') renamePane();
else if (cmd === 'backup') backup();
else {
  console.log('用法：');
  console.log('  node scripts/worktable-layout.cjs show');
  console.log('  node scripts/worktable-layout.cjs set --top 2 --main 1 [--ratio 0.5] [--title bug-solver]');
  console.log('  node scripts/worktable-layout.cjs rename-pane p3 "herdr"');
  console.log('  node scripts/worktable-layout.cjs backup');
}
