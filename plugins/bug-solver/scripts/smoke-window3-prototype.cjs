'use strict';
// 窗口3 UI 原型的 jsdom 冒烟：验证三个变体、场景切换和主流程按钮能跑通。
// 用法：node scripts/smoke-window3-prototype.cjs
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('F:\\ai-project\\deepseek-harness\\node_modules\\jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'prototype-window3-ui.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (msg) => errors.push('console.error: ' + msg));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://127.0.0.1:3131/prototype-window3-ui.html?variant=console',
  virtualConsole: vc,
});
const { document, Event } = dom.window;
console.log('loaded cards=', document.querySelectorAll('.pt-card').length);
const results = [];
function ok(name, cond) { results.push((cond ? 'PASS ' : 'FAIL ') + name); }

function text(sel) {
  const el = document.querySelector(sel);
  return el ? el.textContent : '';
}
function click(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error('missing ' + sel);
  el.click();
}
function scenario(name) {
  const sel = document.getElementById('scenario');
  sel.value = name;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
function variant(name) {
  const btn = document.querySelector('[data-variant="' + name + '"]');
  btn.click();
}

ok('初始渲染为控制台', !!document.querySelector('.pt-console'));
ok('初始有确认信息', /确认信息/.test(text('#app')) && /确认并派发/.test(text('#app')));
ok('三条布局按钮', document.querySelectorAll('#variants button').length === 3);

variant('timeline');
ok('切到时间线', !!document.querySelector('.pt-timeline'));
variant('wizard');
ok('切到向导', !!document.querySelector('.pt-wizardStep'));
variant('console');
click('[data-view="chat"]');
ok('对话页签显示只读镜像', !!document.querySelector('.pt-chatList') && /只读镜像/.test(text('#app')));
ok('对话有消息', document.querySelectorAll('.pt-msg').length >= 5);
ok('对话没有输入框', document.querySelectorAll('.pt-chatList input, .pt-chatList textarea').length === 0);
click('[data-chat="review"]');
ok('审核对话有结论', /审核结论/.test(text('#app')));
click('[data-view="task"]');
ok('回到任务视图', !!document.querySelector('.pt-chatList') === false);

scenario('plan1');
ok('场景 plan1 显示方案', /修复方案/.test(text('#app')) && /批准方案/.test(text('#app')));
click('[data-act="approve-plan"]');
ok('批准后进入实现', /实现中/.test(text('#app')) && /模拟：修复完成/.test(text('#app')));
click('[data-act="complete"]');
ok('实现完成进入审核', /审核结论/.test(text('#app')) && /要改/.test(text('#app')));
click('[data-act="next-round"]');
ok('自动进入第 2 轮方案', /第 2 轮/.test(text('#app')) && /批准方案/.test(text('#app')));
click('[data-act="approve-plan"]');
click('[data-act="complete"]');
ok('第 2 轮审核通过', /审核结论/.test(text('#app')) && /通过/.test(text('#app')));
click('[data-act="final"]');
ok('最终通过后显示复盘入口', /已通过/.test(text('#app')) && /去复盘窗口4/.test(text('#app')));

scenario('confirm');
click('[data-act="confirm"]');
ok('确认并派发后进入方案', /修复方案/.test(text('#app')));

scenario('needs');
ok('需要你回复状态', /会话需要你确认/.test(text('#app')));
click('[data-act="answer-needs"]');
ok('回答后回到流程', /修复方案|实现中/.test(text('#app')));

scenario('stopped');
ok('停止状态', /已停止/.test(text('#app')));

ok('无脚本错误', errors.length === 0);

console.log(results.join('\n'));
if (errors.length) console.log(errors.join('\n'));
try { dom.window.close(); } catch { /* ignore */ }
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
