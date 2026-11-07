'use strict';
// 原型预览：本地静态服务 + Edge 截图三种 UI 变体（?variant=A/B/C）。
// 用法：node scripts/dev-preview-prototype.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { connect } = require('./cdp-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PORT = 3124;

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }[ext] || 'application/octet-stream';
}

async function main() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    let file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    } else { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const cdp = await connect();
  const created = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  const errors = [];
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('EXCEPTION ' + JSON.stringify(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('CONSOLE ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ')); });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  for (const v of ['A', 'B', 'C']) {
    const url = `http://127.0.0.1:${PORT}/prototype-tb-bugs-ui.html?variant=${v}`;
    await cdp.send('Page.navigate', { url }, sessionId);
    await new Promise((r) => setTimeout(r, 2500));
    const state = await cdp.evaluate(sessionId, `({ variant: new URLSearchParams(location.search).get('variant'), rows: document.querySelectorAll('.va-row, .vb-card, .vc-table tr.row').length, stats: document.querySelectorAll('.va-stat').length, label: document.getElementById('swLabel').textContent, note: document.getElementById('swState').textContent })`, 8000);
    console.log('VARIANT', v, JSON.stringify(state));
    const png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 15000);
    const file = path.join(PREVIEW_DIR, 'proto-' + v + '.png');
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log('SHOT', file);

    // 交互态：A 选中列表项 / B 打开抽屉 / C 展开行
    const act = v === 'A'
      ? `document.querySelector('.va-row') && document.querySelector('.va-row').click(); true`
      : v === 'B'
        ? `document.querySelector('.vb-card') && document.querySelector('.vb-card').click(); true`
        : `document.querySelector('.vc-table tr.row') && document.querySelector('.vc-table tr.row').click(); true`;
    await cdp.evaluate(sessionId, act, 5000);
    await new Promise((r) => setTimeout(r, 900));
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 15000);
    const file2 = path.join(PREVIEW_DIR, 'proto-' + v + '-detail.png');
    fs.writeFileSync(file2, Buffer.from(shot2.data, 'base64'));
    console.log('SHOT', file2);
  }
  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 8), null, 1));
  try { await cdp.send('Target.closeTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  cdp.close();
  server.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
