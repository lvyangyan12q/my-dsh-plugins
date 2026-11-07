'use strict';
// 本会话后台进程方案（方案 B）：轮询 control.json，到点或选择变化时调用一次 collect-tb.cjs。
// 特点：不写系统任务；进程运行期间生效，DSH 结束/重启后需重新启动。
//
// 用法：node scripts/agent-loop.cjs
// 停止：Ctrl+C（或结束该 node 进程）；也可在窗口中关闭“定时拉取”（本进程保持空闲，不再访问 TB）。
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONTROL = path.join(DATA, 'control.json');
const STATE = path.join(DATA, 'state.json');
const COLLECTOR = path.join(__dirname, 'collect-tb.cjs');
const POLL_MS = 3000;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function stamp() { return new Date().toISOString(); }
function say(msg) { console.log(stamp() + ' ' + msg); }

let running = false;
let state = readJson(STATE, {});

function due(control) {
  if (!control || control.enabled !== true) return false;
  if (!control.projectId || !control.personId) return false;
  const intervalMin = Number(control.intervalMinutes) > 0 ? Number(control.intervalMinutes) : 10;
  const lastPull = state.lastPullAt ? new Date(state.lastPullAt).getTime() : 0;
  const controlChanged = control.updatedAt && control.updatedAt !== state.lastControlAt;
  const selectedChanged = !state.selection
    || state.selection.projectId !== control.projectId
    || state.selection.personId !== control.personId;
  const timeDue = !lastPull || Date.now() - lastPull >= intervalMin * 60 * 1000;
  return controlChanged || selectedChanged || timeDue;
}

function runCollector() {
  running = true;
  const child = spawn(process.execPath, [COLLECTOR], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  child.on('exit', () => {
    running = false;
    state = readJson(STATE, state);
  });
  child.on('error', () => { running = false; });
}

say('agent-loop started (pid ' + process.pid + ')，每 ' + POLL_MS / 1000 + ' 秒检查一次开关');
setInterval(() => {
  const control = readJson(CONTROL, null);
  if (!control || control.enabled !== true) return; // 关闭：完全空闲
  state = readJson(STATE, state);
  if (!running && due(control)) {
    say('触发采集：' + (control.projectName || control.projectId) + ' × ' + (control.personName || control.personId));
    runCollector();
  }
}, POLL_MS);

process.on('SIGINT', () => { say('agent-loop stopped'); process.exit(0); });
process.on('SIGTERM', () => { say('agent-loop stopped'); process.exit(0); });
