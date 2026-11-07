'use strict';
// 窗口3 UI 原型预览：本地静态服务（代理 dshell.css）+ 已开调试端口的 Edge 截图。
// 用法：node scripts/dev-preview-window3-prototype.cjs
// 产物：preview/proto-window3-<variant>-<width>.png
// 注：首次连接 Edge 调试端口时，浏览器会弹一次“允许”；点允许即可。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { connect } = require('./cdp-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW = path.join(ROOT, 'preview');
const PORT = 3131;
const PAGE = 'prototype-window3-ui.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
}

async function getDshellCss() {
  try {
    const r = await fetch('http://127.0.0.1:3080/api/worktable/template/dshell.css');
    if (r.ok) return await r.text();
  } catch { /* ignore */ }
  return '';
}

function startServer(css) {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/api/worktable/template/dshell.css') {
        res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
        res.end(css);
        return;
      }
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
        res.end(fs.readFileSync(file));
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  fs.mkdirSync(PREVIEW, { recursive: true });
  const css = await getDshellCss();
  const server = await startServer(css);
  const cdp = await connect();
  const created = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  const errors = [];
  cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ')); });

  const viewport = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  const shot = async (name) => {
    const png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 20000);
    const file = path.join(PREVIEW, name + '.png');
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log('SHOT', path.relative(ROOT, file), fs.statSync(file).size);
  };

  for (const variant of ['console', 'timeline', 'wizard']) {
    for (const [w, h] of [[1200, 900], [760, 560]]) {
      await viewport(w, h);
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE + '?variant=' + variant }, sessionId);
      await sleep(900);
      const m = await cdp.evaluate(sessionId, `(() => {
        const root = document.documentElement;
        const bar = document.querySelector('.pt-bar');
        const barR = bar ? bar.getBoundingClientRect() : null;
        const cards = [...document.querySelectorAll('.pt-card')];
        const last = cards.length ? cards[cards.length - 1].getBoundingClientRect() : null;
        const overflow = [...document.querySelectorAll('body *')].filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
        }).slice(0, 4).map((el) => (el.className || el.tagName) + '@' + Math.round(el.getBoundingClientRect().right));
        return {
          variant: new URLSearchParams(location.search).get('variant'),
          w: innerWidth, h: innerHeight,
          scrollW: root.scrollWidth, scrollH: root.scrollHeight,
          barTop: barR ? Math.round(barR.top) : null, barH: barR ? Math.round(barR.height) : null,
          lastBottom: last ? Math.round(last.bottom) : null,
          hiddenByBar: !!(last && barR && last.bottom > barR.top),
          overflow,
          consoleDisplay: getComputedStyle(document.querySelector('.pt-console') || document.body).display
        };
      })()`);
      console.log('METRIC', variant, w, JSON.stringify(m));
      await shot('proto-window3-' + variant + '-' + w);
    }
  }
  if (errors.length) console.log('ERRORS', errors.slice(0, 5));
  await cdp.send('Target.closeTarget', { targetId: created.targetId });
  cdp.close();
  server.close();
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
