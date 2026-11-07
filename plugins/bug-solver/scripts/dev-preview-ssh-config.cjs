'use strict';
// 窗口2「配置管理」本地预览：静态服务 + 伪造工作台 API（write / 终端通道）+ Edge 截图。
// 只跑一次即可：node scripts/dev-preview-ssh-config.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { connect } = require('./cdp-lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PORT = 3126;
const DSH = 'http://127.0.0.1:3080';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 在页面脚本之前注入：假的 WebSocket（终端通道），返回可预测的 ssh / git 输出
const MOCK_WS = `
<script>
(function () {
  function FakeWS(url) {
    var self = this;
    this.url = url;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    setTimeout(function () { if (self.onopen) self.onopen({}); }, 60);
    this.send = function (cmd) {
      var text = String(cmd || '');
      setTimeout(function () { if (self.onmessage) self.onmessage({ data: '\\u001b[32mPS>\\u001b[0m ' + text + '\\r\\n' }); }, 40);
      var out = '';
      if (text.indexOf('printf WB_SSH_%s') >= 0) out = 'WB_SSH_OK\\r\\n';
      else if (text.indexOf('WB_KEY_') >= 0) out = 'WB_KEY_OK\\r\\n';
      else if (text.indexOf('git branch -a') >= 0) out = '* develop\\r\\n  master\\r\\n  release/2026.10\\r\\n  feature/tb-sync\\r\\n  hotfix/login-redirect\\r\\n  remotes/origin/develop\\r\\n  remotes/origin/master\\r\\nWB_BRANCH_END\\r\\n';
      if (out) setTimeout(function () { if (self.onmessage) self.onmessage({ data: out }); }, 480);
      setTimeout(function () { if (self.onclose) self.onclose({}); }, 900);
    };
    this.close = function () {};
  }
  window.WebSocket = FakeWS;
})();
</script>
`;

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/api/worktable/template/')) {
      try {
        const r = await fetch(DSH + u.pathname);
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain' });
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) {
        res.writeHead(502); res.end('proxy error');
      }
      return;
    }
    if (u.pathname === '/api/worktable/write' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        console.log('MOCK-WRITE', body.length, 'bytes');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      let body = fs.readFileSync(file);
      if (path.extname(file).toLowerCase() === '.html') {
        const html = body.toString('utf8');
        body = Buffer.from(html.replace('<div class="toast" id="toast"></div>', '<div class="toast" id="toast"></div>' + MOCK_WS), 'utf8');
      }
      res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
      res.end(body);
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

  const evaluate = (expr) => cdp.evaluate(sessionId, expr, 25000);
  const viewport = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  const go = async () => {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ssh-config.html` }, sessionId);
    await sleep(1500);
  };
  const shot = async (name) => {
    for (let i = 0; i < 3; i++) {
      try {
        const png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId, 20000);
        const file = path.join(PREVIEW_DIR, name + '.png');
        fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
        console.log('SHOT', file);
        return;
      } catch (e) {
        console.log('SHOT-RETRY', name, e.message);
        await sleep(700);
      }
    }
    console.log('SHOT-FAIL', name);
  };
  const state = async (label) => {
    const s = await evaluate(`({
      tab: (document.querySelector('.cfg-tab.on')||{}).textContent || '',
      conns: document.querySelectorAll('[data-action="select-conn"]').length,
      projs: document.querySelectorAll('[data-action="select-proj"]').length,
      projects: document.querySelectorAll('.linkItem').length,
      branches: document.querySelectorAll('.branchChip').length,
      mxCells: document.querySelectorAll('.mx-cell').length,
      mxOn: document.querySelectorAll('.mx-cell.on').length,
      badge: (document.querySelector('[data-test-badge]')||{}).textContent || '',
      testRows: [...document.querySelectorAll('.tstRow')].map(r => r.className.replace('tstRow ','') + '|' + r.textContent.trim()),
      notice: (document.querySelector('.notice')||{}).textContent || '',
      errors: [...document.querySelectorAll('.fldErr')].map(n => n.textContent.trim()).filter(Boolean),
      toast: (document.getElementById('toast')||{}).textContent || '',
      title: (document.querySelector('.edHead h2')||{}).textContent || ''
    })`);
    console.log('STATE', label, JSON.stringify(s));
    return s;
  };
  const click = async (sel) => {
    const r = await evaluate(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return 'MISS'; n.click(); return 'OK'; })()`);
    if (r !== 'OK') console.log('CLICK-MISS', sel);
    return r;
  };

  await viewport(1080, 760);
  await go();
  await state('conn-tab');
  await shot('cfg-conn');

  // 测试连接（假的终端返回 WB_KEY_OK / WB_SSH_OK）
  await click('[data-action="test-conn"]');
  await sleep(2600);
  await state('test-ok');
  await shot('cfg-conn-test');

  // 代码项目页签
  await click('.cfg-tab[data-value="proj"]');
  await sleep(500);
  await state('proj-tab');
  await shot('cfg-proj');

  // 读取分支
  await click('[data-action="read-branches"]');
  await sleep(2600);
  await state('branches');
  await shot('cfg-proj-branches');

  // 关联视图
  await click('.cfg-tab[data-value="matrix"]');
  await sleep(400);
  await state('matrix');
  await shot('cfg-matrix');

  // 矩阵里切换一格 → 立即保存
  await evaluate(`(() => { const c = document.querySelectorAll('.mx-cell')[2]; if (!c) return 'MISS'; c.click(); return 'OK'; })()`);
  await sleep(600);
  await state('matrix-toggled');
  await shot('cfg-matrix-toggled');

  // 新建连接（校验空态）
  await click('.cfg-tab[data-value="conn"]');
  await sleep(300);
  await click('[data-action="new-conn"]');
  await sleep(300);
  await click('[data-action="save-conn"]');
  await sleep(500);
  await state('new-conn-validation');
  await shot('cfg-conn-validation');

  // 窄屏
  await viewport(560, 760);
  await go();
  await shot('cfg-conn-narrow');
  await click('.cfg-tab[data-value="proj"]');
  await sleep(400);
  await shot('cfg-proj-narrow');
  await click('.cfg-tab[data-value="matrix"]');
  await sleep(400);
  await shot('cfg-matrix-narrow');

  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 10), null, 1));
  else console.log('ERRORS none');

  try { await cdp.send('Target.closeTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  cdp.close();
  server.close();
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
