'use strict';
// UI 预览/冒烟测试：本地复刻工作台的 site 路由、写入接口与终端通道，
// 用 Edge 打开 tb-bugs.html，跑一次「立即拉取」并截图。
//
// 用法：node scripts/dev-preview.cjs
// 产物：preview/tb-bugs*.png
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { connect } = require('./cdp-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PORT = 3123;
const WIDGET = 'tb-bugs.html';

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

async function getDshellCss() {
  try {
    const r = await fetch('http://127.0.0.1:3080/api/worktable/template/dshell.css');
    if (r.ok) return await r.text();
  } catch { /* ignore */ }
  return '/* dshell.css unavailable */';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function wsFrame(text) {
  const data = Buffer.from(text, 'utf8');
  const len = data.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, data]);
}

// 预览用的“终端通道”：收到连接后直接跑一次真实采集脚本，把输出按 WS 文本帧回传。
function attachMockTerminal(server) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    // 沙箱下不能给子进程管道（spawn EPERM），所以忽略输出，退出后按退出码发送结束标记。
    const child = spawn(process.execPath, [path.join(__dirname, 'collect-tb.cjs')], { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', (code) => {
      try { socket.write(wsFrame('TB-PULL-DONE ' + (code === 0 ? 'ok' : 'fail') + '\n')); } catch { /* ignore */ }
      setTimeout(() => { try { socket.write(Buffer.from([0x88, 0])); socket.end(); } catch { /* ignore */ } }, 150);
    });
    socket.on('error', () => { try { child.kill(); } catch { /* ignore */ } });
  });
}

async function main() {
  const css = await getDshellCss();
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/api/worktable/template/dshell.css') {
        res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
        res.end(css);
        return;
      }
      if (u.pathname === '/api/worktable/write' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.path) { res.writeHead(400); res.end('{"error":"missing path"}'); return; }
        fs.mkdirSync(path.dirname(body.path), { recursive: true });
        fs.writeFileSync(body.path, String(body.content ?? ''), 'utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      const siteMatch = u.pathname.match(/^\/api\/worktable\/site\/([^/]+)\/(.+)$/);
      let file;
      if (siteMatch) {
        const root = decodeURIComponent(siteMatch[1]);
        const rel = siteMatch[2].split('/').map((s) => decodeURIComponent(s)).join(path.sep);
        file = path.resolve(root, rel);
        if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
      } else {
        file = path.join(ROOT, decodeURIComponent(u.pathname));
      }
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
        res.end(fs.readFileSync(file));
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found: ' + u.pathname);
      }
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  attachMockTerminal(server);

  const projectDir = ROOT;
  const url = `http://127.0.0.1:${PORT}/api/worktable/site/${encodeURIComponent(projectDir)}/${WIDGET}`;
  const cdp = await connect();
  const created = await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  const errors = [];
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('EXCEPTION ' + JSON.stringify(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errors.push('CONSOLE ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  await cdp.send('Page.navigate', { url }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));
  const pageState = await cdp.evaluate(sessionId, `({ href: location.href, title: document.title, ready: document.readyState, rows: document.querySelectorAll('#list .row').length, badge: document.getElementById('badge').textContent, notice: document.getElementById('notice').hidden ? null : document.getElementById('notice').textContent, chips: document.getElementById('chips').innerText })`, 10000);
  console.log('PAGE', JSON.stringify(pageState, null, 1));
  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const shot = async (name) => {
    let png = null;
    for (let attempt = 0; attempt < 3 && !png; attempt++) {
      try {
        png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 20000);
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (!png) { console.log('SHOT_FAILED', name); return; }
    const file = path.join(PREVIEW_DIR, name + '.png');
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log('SHOT', file);
  };

  await shot('tb-bugs');
  // 点击第一条 → 整页详情浮层
  await cdp.evaluate(sessionId, `document.querySelector('#list .row') && document.querySelector('#list .row').click()`, 5000);
  await new Promise((r) => setTimeout(r, 800));
  const detail = await cdp.evaluate(sessionId, `({ overlay: !document.getElementById('overlay').hidden, title: document.querySelector('.dTitle') && document.querySelector('.dTitle').textContent, sections: document.querySelectorAll('.sec').length, actions: document.querySelectorAll('.actions button, .actions a').length })`, 5000);
  console.log('DETAIL', JSON.stringify(detail));
  await shot('tb-bugs-detail');
  // 关闭详情 → 回到列表
  await cdp.evaluate(sessionId, `document.getElementById('ovClose').click()`, 5000);
  await new Promise((r) => setTimeout(r, 500));
  const closed = await cdp.evaluate(sessionId, `document.getElementById('overlay').hidden`, 5000);
  console.log('CLOSED_OVERLAY', closed);
  // 点行内「处理」→ 详情浮层 + 处理面板
  await cdp.evaluate(sessionId, `document.querySelector('.handleBtn') && document.querySelector('.handleBtn').click()`, 5000);
  await new Promise((r) => setTimeout(r, 900));
  const panel = await cdp.evaluate(sessionId, `({ overlay: !document.getElementById('overlay').hidden, panel: !!document.querySelector('.handle'), sections: Array.from(document.querySelectorAll('.hsec')).map(x => x.textContent), groups: Array.from(document.querySelectorAll('.hgroup .hk')).map(x => x.textContent) })`, 5000);
  console.log('PANEL', JSON.stringify(panel));
  await cdp.evaluate(sessionId, `document.getElementById('ovBody').scrollTop = 99999; true`, 5000);
  await new Promise((r) => setTimeout(r, 500));
  await shot('tb-bugs-handle');
  await cdp.evaluate(sessionId, `document.getElementById('ovBack').click()`, 5000);
  await new Promise((r) => setTimeout(r, 500));
  // 切到“全部”
  await cdp.evaluate(sessionId, `Array.from(document.querySelectorAll('#chips .chip')).find(b => b.textContent.indexOf('全部') === 0).click()`, 5000);
  await new Promise((r) => setTimeout(r, 500));
  const allRows = await cdp.evaluate(sessionId, `document.querySelectorAll('#list .row').length`, 5000);
  console.log('ALL_ROWS', allRows);
  await shot('tb-bugs-all');
  // 点击「立即拉取」，等待终端通道执行完采集脚本
  const before = Date.now();
  await cdp.evaluate(sessionId, `document.getElementById('pullBtn').click()`, 5000);
  let pullState = null;
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    pullState = await cdp.evaluate(sessionId, `({ badge: document.getElementById('badge').textContent, notice: document.getElementById('notice').hidden ? null : document.getElementById('notice').textContent, btn: document.getElementById('pullBtn').textContent })`, 5000);
    if (pullState.btn === '立即拉取' && pullState.badge !== '拉取中…') break;
  }
  console.log('PULL', JSON.stringify({ waitedMs: Date.now() - before, state: pullState }));
  try {
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state.json'), 'utf8'));
    console.log('STATE_AFTER', JSON.stringify({ ok: st.ok, skipped: st.skipped, reason: st.reason, lastPullAt: st.lastPullAt, counts: st.counts, error: st.error }));
  } catch (e) { console.log('STATE_AFTER_ERR', e.message); }
  await shot('tb-bugs-pulled');

  try { await cdp.send('Target.closeTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  cdp.close();
  server.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
