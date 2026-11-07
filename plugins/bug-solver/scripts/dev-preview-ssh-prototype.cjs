'use strict';
// 窗口2「配置管理 / SSH 连接」原型预览：本地静态服务（代理 dshell.css）+ Edge 截图 + 交互自检。
// 用法：node scripts/dev-preview-ssh-prototype.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { connect } = require('./cdp-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PORT = 3125;
const DSH = 'http://127.0.0.1:3080';
const FILE = 'prototype-ssh-config-ui.html';

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' }[ext] || 'application/octet-stream';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/api/worktable/template/')) {
      try {
        const r = await fetch(DSH + u.pathname);
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain' });
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('proxy error: ' + e.message);
      }
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const server = await startServer();
  const cdp = await connect();
  const created = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  try { await cdp.send('Target.activateTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  const errors = [];
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('EXCEPTION ' + JSON.stringify(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('CONSOLE ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ')); });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const evaluate = (expr) => cdp.evaluate(sessionId, expr, 20000);
  const viewport = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  const go = async (variant) => {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${FILE}?variant=${variant}` }, sessionId);
    await sleep(1300);
  };
  const shot = async (name) => {
    try { await cdp.send('Page.bringToFront', {}, sessionId, 8000); } catch { /* ignore */ }
    let png = null;
    for (let i = 0; i < 3; i++) {
      try {
        png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 20000);
        break;
      } catch (e) {
        console.log('SHOT-RETRY', name, e.message);
        await sleep(800);
      }
    }
    if (!png) { console.log('SHOT-FAIL', name); return; }
    const file = path.join(PREVIEW_DIR, name + '.png');
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log('SHOT', file);
  };
  const click = async (selector) => {
    const ok = await evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return 'MISS ' + ${JSON.stringify(selector)}; n.click(); return 'OK'; })()`);
    if (ok !== 'OK') console.log('CLICK', ok);
    return ok;
  };
  const state = async (label) => {
    const s = await evaluate(`({
      label: (document.getElementById('swLabel')||{}).textContent,
      swState: (document.getElementById('swState')||{}).textContent,
      items: document.querySelectorAll('.ma-item').length,
      rows: document.querySelectorAll('.mb-table tbody tr').length,
      cards: document.querySelectorAll('.mc-card').length,
      editorTitle: (document.querySelector('.edHead h2')||{}).textContent || '',
      drawerOpen: !!document.querySelector('.mb-drawer.on'),
      testRows: [...document.querySelectorAll('.tstRow')].map(r => r.className.replace('tstRow ','') + '|' + r.textContent.trim()),
      fail: (document.querySelector('.tstFail')||{}).textContent || '',
      errs: [...document.querySelectorAll('.fldErr')].map(n => n.textContent.trim()).filter(Boolean),
      toast: (document.getElementById('toast')||{}).textContent || '',
      empty: !!document.querySelector('.emptyState')
    })`);
    console.log('STATE', label, JSON.stringify(s));
    return s;
  };

  // ---- 三种管理方式基础渲染 ----
  await viewport(1080, 760);
  for (const v of ['A', 'B', 'C']) {
    await go(v);
    await state('render-' + v);
    await shot('proto-ssh-' + v);
  }

  // ---- A：测试连接成功 ----
  await go('A');
  await click('.ma-editor [data-action="test-draft"]');
  await sleep(4200);
  await state('A-test-ok');
  await shot('proto-ssh-A-test');

  // ---- A：失败态（演示失败） ----
  await click('.ma-editor [data-action="demo-fail"]');
  await sleep(4200);
  await state('A-test-fail');
  await shot('proto-ssh-A-fail');

  // ---- A：校验错误 ----
  await evaluate(`(() => {
    const h = document.querySelector('[data-field="host"]');
    h.value = 'bad host!';
    h.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.ma-editor [data-action="save"]').click();
    return 'ok';
  })()`);
  await sleep(500);
  await state('A-validation');
  await shot('proto-ssh-A-validation');

  // ---- A：新建连接 ----
  await click('.ma-sideHead [data-action="new"]');
  await sleep(300);
  await state('A-new');
  await shot('proto-ssh-A-new');

  // ---- B：表格事件。先点第二行「测试」→ 2222 端口失败 ----
  await go('B');
  await click('[data-action="quick-test"][data-value="c2"]');
  await sleep(4200);
  await state('B-quick-test-fail');
  await shot('proto-ssh-B-test');

  // ---- B：点行开抽屉编辑 ----
  await click('.mb-table [data-action="edit"][data-value="c1"]');
  await sleep(400);
  await state('B-drawer');
  await shot('proto-ssh-B-drawer');

  // ---- B：删除二次确认 ----
  await click('.mb-drawer [data-action="delete"]');
  await sleep(300);
  await state('B-delete-confirm');
  await shot('proto-ssh-B-delete');
  await click('.mb-drawer [data-action="delete-cancel"]');
  await sleep(200);

  // ---- C：卡片 → 全屏编辑 ----
  await go('C');
  await click('.mc-card [data-action="edit"][data-value="c3"]');
  await sleep(400);
  await state('C-editor');
  await shot('proto-ssh-C-editor');
  await click('.mc-toolbar [data-action="close-editor"]');
  await sleep(300);

  // ---- C：卡片上删除确认 ----
  await click('.mc-card [data-action="delete"][data-value="c2"]');
  await sleep(300);
  await state('C-delete-confirm');
  await shot('proto-ssh-C-delete');

  // ---- 窄屏 ----
  await viewport(520, 760);
  for (const v of ['A', 'B', 'C']) {
    await go(v);
    await shot('proto-ssh-' + v + '-narrow');
  }

  // ---- 空状态：删光连接 ----
  await viewport(1080, 760);
  await go('C');
  for (const id of ['c1', 'c2', 'c3']) {
    await click(`.mc-card [data-action="delete"][data-value="${id}"]`);
    await sleep(150);
    await click(`.mc-card [data-action="delete"][data-value="${id}"]`);
    await sleep(250);
  }
  await state('C-empty');
  await shot('proto-ssh-C-empty');

  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  else console.log('ERRORS none');

  try { await cdp.send('Target.closeTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  cdp.close();
  server.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
