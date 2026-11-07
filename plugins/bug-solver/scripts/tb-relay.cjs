'use strict';
// TB 常驻转发（推荐用法）：只连一次 Edge 调试端口并保持连接，
// 窗口点「立即拉取」时复用这条连接，因此 Edge 只会在启动时让你授权一次。
//
// 用法：node scripts/tb-relay.cjs
// 停止：Ctrl+C（或结束该 node 进程）；停止后窗口会退回“每次拉取新连接”的模式。
//
// HTTP（仅绑定 127.0.0.1）：
//   GET  /health  → { ok, connected, hasSession, since }
//   POST /pull    → 用常驻连接跑一次采集，返回 { ok, counts, lastPullAt, error }
const http = require('node:http');
const { connect } = require('./cdp-lib.cjs');
const core = require('./collect-tb.cjs');

const PORT = Number(process.env.TB_RELAY_PORT || 47821);
const HOST = '127.0.0.1';

let cdp = null;
let sessionId = null;
let connecting = null;
let busy = false;
let startedAt = new Date().toISOString();

function log(line) {
  core.log('[relay] ' + line);
  console.log(new Date().toISOString() + ' [relay] ' + line);
}

async function ensureConnected() {
  if (cdp && sessionId) return { cdp, sessionId };
  if (connecting) return connecting;
  connecting = (async () => {
    if (cdp) { try { cdp.close(); } catch { /* ignore */ } cdp = null; sessionId = null; }
    const conn = await connect(); // 单次尝试：只在这里可能弹一次 Edge 授权
    const tab = await core.openCollectorTab(conn);
    cdp = conn;
    sessionId = tab.sessionId;
    log('connected' + (tab.reused ? '（复用已有 TB 标签页）' : '（新建后台标签页）'));
    return { cdp, sessionId };
  })().finally(() => { connecting = null; });
  return connecting;
}

function dropConnection() {
  try { if (cdp) cdp.close(); } catch { /* ignore */ }
  cdp = null;
  sessionId = null;
}

async function pull() {
  const control = core.readJson(core.CONTROL_FILE, { enabled: false });
  const previous = core.readJson(core.STATE_FILE, {});
  const base = core.buildState(control, previous, Date.now());

  if (control.enabled !== true) {
    log('pull rejected: disabled');
    return { status: 409, body: { ok: false, error: '采集开关已关闭（control.enabled=false）' } };
  }
  if (!control.projectId || !control.personId) {
    return { status: 409, body: { ok: false, error: '请先选择项目和负责人' } };
  }

  let conn;
  try {
    conn = await ensureConnected();
  } catch (error) {
    // 连接失败不自动重试，避免反复弹授权
    base.error = error.message || String(error);
    base.finishedAt = core.stamp();
    base.updatedAt = core.stamp();
    core.writeState(base);
    log('connect error: ' + base.error);
    return { status: 502, body: { ok: false, error: base.error } };
  }

  try {
    const startedAt = Date.now();
    const result = await core.collectOnce(conn.cdp, conn.sessionId, control);
    const payload = result.payload;
    if (!payload) {
      base.ok = true;
      base.skipped = true;
      base.reason = result.reason;
      base.finishedAt = core.stamp();
      base.durationMs = Date.now() - startedAt;
      base.updatedAt = core.stamp();
      core.writeState(base);
      return { status: 200, body: { ok: true, skipped: true, reason: result.reason } };
    }
    const intervalMinutes = base.intervalMinutes;
    const done = {
      ...base,
      ok: true,
      skipped: false,
      lastPullAt: payload.updatedAt,
      lastControlAt: control.updatedAt || null,
      nextDueAt: new Date(new Date(payload.updatedAt).getTime() + intervalMinutes * 60 * 1000).toISOString(),
      counts: { bugs: payload.bugs.length, total: payload.total },
      warnings: payload.warnings,
      error: null,
      finishedAt: core.stamp(),
      durationMs: Date.now() - startedAt,
      updatedAt: core.stamp(),
    };
    core.writeState(done);
    log('pulled bugs=' + payload.bugs.length + ' total=' + payload.total + ' in ' + done.durationMs + 'ms');
    return { status: 200, body: { ok: true, counts: done.counts, lastPullAt: done.lastPullAt, durationMs: done.durationMs } };
  } catch (error) {
    const message = error.message || String(error);
    base.error = message;
    base.finishedAt = core.stamp();
    base.updatedAt = core.stamp();
    core.writeState(base);
    log('pull error: ' + message);
    // 连接可能已失效（Edge 重启等）：断开，下次请求会重新连接
    dropConnection();
    return { status: 502, body: { ok: false, error: message } };
  }
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://relay.local');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }
  if (u.pathname === '/health') {
    send(res, 200, { ok: true, connected: Boolean(cdp && sessionId), busy, since: startedAt, port: PORT });
    return;
  }
  if (u.pathname === '/pull' && req.method === 'POST') {
    if (busy) { send(res, 429, { ok: false, error: '已有一次拉取在进行中' }); return; }
    busy = true;
    try {
      const out = await pull();
      send(res, out.status, out.body);
    } finally {
      busy = false;
    }
    return;
  }
  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, HOST, () => {
  log('listening on http://' + HOST + ':' + PORT + '（窗口优先使用常驻连接；Edge 只需授权一次）');
});

process.on('SIGINT', () => { log('stopping'); dropConnection(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { log('stopping'); dropConnection(); server.close(() => process.exit(0)); });
