'use strict';
/**
 * 项目布局（.dsh-worktable/layout.json，version 3）小工具：
 *
 *   node scripts/worktable-layout-v3.cjs show
 *   node scripts/worktable-layout-v3.cjs only p3     # 只展开窗口3，其余收起
 *   node scripts/worktable-layout-v3.cjs all         # 全部展开
 *   node scripts/worktable-layout-v3.cjs toggle p1   # 收起/展开某个窗格
 *
 * 直接改项目目录里的布局文件；工作台重新打开该项目（或刷新页面）即生效。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, '.dsh-worktable', 'layout.json');

function read() {
  if (!fs.existsSync(FILE)) {
    console.error('找不到布局文件：' + FILE + '（先在 工作台 里打开一次 bug-solver 项目）');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(doc) {
  doc.revision = (doc.revision || 0) + 1;
  doc.savedAt = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('已写入布局（revision ' + doc.revision + '）。重新打开项目/刷新页面生效。');
}

function panes(spec) {
  const left = spec.left ? [spec.left, ...(spec.leftMore || [])] : [];
  return [...left.map((pane) => ({ row: 'left', pane })), ...(spec.top || []).map((pane) => ({ row: 'top', pane })), ...(spec.main || []).map((pane) => ({ row: 'main', pane }))];
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'show' || !cmd) {
  const doc = read();
  console.log('文件：' + FILE);
  console.log('version ' + doc.version + ' · revision ' + doc.revision + ' · ' + doc.savedAt);
  for (const { row, pane } of panes(doc.spec)) {
    const state = pane.minimized ? '收起' : pane.collapsed ? '折叠(只剩标题栏)' : '展开';
    const tabs = (pane.tabs || []).map((t) => t.title).join(' | ') || '（无标签）';
    console.log(`  [${row}] ${pane.id} ${pane.title} — ${state} — ${tabs}`);
  }
  process.exit(0);
}

if (cmd === 'only') {
  if (!arg) { console.error('用法：only <paneId>，例如 only p3'); process.exit(1); }
  const doc = read();
  let found = false;
  for (const { pane } of panes(doc.spec)) {
    const keep = pane.id === arg;
    if (keep) found = true;
    pane.minimized = !keep;
    pane.collapsed = false;
  }
  if (!found) { console.error('没有这个窗格：' + arg); process.exit(1); }
  write(doc);
  process.exit(0);
}

if (cmd === 'all') {
  const doc = read();
  for (const { pane } of panes(doc.spec)) { pane.minimized = false; pane.collapsed = false; }
  write(doc);
  process.exit(0);
}

if (cmd === 'toggle') {
  if (!arg) { console.error('用法：toggle <paneId>'); process.exit(1); }
  const doc = read();
  const target = panes(doc.spec).find(({ pane }) => pane.id === arg);
  if (!target) { console.error('没有这个窗格：' + arg); process.exit(1); }
  target.pane.minimized = !target.pane.minimized;
  write(doc);
  process.exit(0);
}

console.error('未知命令：' + cmd + '\n可用：show | only <paneId> | all | toggle <paneId>');
process.exit(1);
