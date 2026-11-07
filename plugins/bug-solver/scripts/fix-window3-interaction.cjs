'use strict';
// 修 window3-dispatch.html 的三处交互问题（幂等，可重复跑）：
//   1) 轮询每 1.5s 整体重建 DOM → 下拉被收起、输入框打字丢焦点（“输入不了”）；
//   2) 深色主题下原生下拉弹层白底、选项白字看不清；
//   3) 编辑结束（失焦）后补一次渲染，避免期间的状态变化丢失。
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'window3-dispatch.html');
let s = fs.readFileSync(FILE, 'utf8');
const log = [];

function ensure(marker, apply, label) {
  if (s.includes(marker)) { log.push('skip ' + label + '（已存在）'); return; }
  const next = apply(s);
  if (next === s) { log.push('MISS ' + label); return; }
  s = next;
  log.push('ok   ' + label);
}

// 1) 下拉选项深色可读
ensure('select option, select optgroup', (src) => src.replace(
  /<\/style>/,
  [
    '  /* 深色主题下原生下拉弹层别用系统白底（否则白字看不清） */',
    '  select { color-scheme: dark; }',
    '  select option, select optgroup { background-color: #101521; color: #e9edf5; }',
    '</style>',
  ].join('\n')
), 'select option colors');

// 2) 状态位
ensure('renderPending', (src) => src.replace(
  /(\r?\n)(\s+)pollTimer: null,/,
  '$1$2pollTimer: null,$1$2renderPending: false,'
), 'state flag renderPending');

// 3) isEditing + render 守卫（CRLF 安全）
ensure('function isEditing()', (src) => {
  const helper = [
    '  /** 是否正在输入或展开下拉：此时重建 DOM 会丢焦点、关掉下拉、让输入框不可用 */',
    '  function isEditing() {',
    '    var a = document.activeElement;',
    '    if (!a) return false;',
    "    var tag = String(a.tagName || '').toUpperCase();",
    "    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable === true;",
    '  }',
    '',
  ].join('\n');
  return src.replace(/(\r?\n)(  function render\(\) \{)/, (m, nl, head) => nl + helper.replace(/\n/g, nl) + head);
}, 'isEditing helper');

ensure('S.renderPending = true; return;', (src) => src.replace(
  /(  function render\(\) \{\r?\n    if \(!root\) return;\r?\n)/,
  (m) => m + '    if (isEditing()) { S.renderPending = true; return; }\n    S.renderPending = false;\n'
), 'render guard');

// 4) 失焦后补渲染
ensure("addEventListener('focusout'", (src) => src.replace(
  /(\r?\n)(  \/\* -+ 交互 -+ \*\/)/,
  (m, nl, head) => nl + [
    '  // 输入/选择结束（失焦）后，把这段时间攒下的状态变化补渲染一次',
    "  document.addEventListener('focusout', function () {",
    '    if (!S.renderPending) return;',
    '    setTimeout(function () { if (!isEditing() && S.renderPending) render(); }, 0);',
    '  });',
    '',
  ].join(nl) + head
), 'focusout flush');

fs.writeFileSync(FILE, s, 'utf8');
console.log(log.join('\n'));
const misses = log.filter((l) => l.startsWith('MISS'));
if (misses.length) { console.error('\n有未命中的替换：' + misses.length); process.exit(1); }
console.log('\n全部就绪');
