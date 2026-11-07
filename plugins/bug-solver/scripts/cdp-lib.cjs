// Minimal Chrome/Edge DevTools Protocol helper over the browser WebSocket.
// Zero dependencies; Node 22+ (global WebSocket).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function devtoolsEndpoint() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Edge', 'User Data', 'DevToolsActivePort'),
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'DevToolsActivePort'),
  ];
  for (const file of candidates) {
    try {
      const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      const port = Number(lines[0]);
      const wsPath = lines[1];
      if (port && wsPath) return { port, wsPath, file };
    } catch {
      // ignore
    }
  }
  throw new Error('未找到浏览器调试端口（DevToolsActivePort）。请以远程调试方式启动 Edge。');
}

class Cdp {
  constructor(ws, timeoutMs = 30000) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.timeoutMs = timeoutMs;
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) for (const fn of list) { try { fn(msg.params); } catch { /* ignore */ } }
      }
    });
    ws.addEventListener('close', () => {
      for (const [, entry] of this.pending) entry.reject(new Error('调试连接已关闭'));
      this.pending.clear();
    });
  }

  on(method, fn) {
    const list = this.handlers.get(method) || [];
    list.push(fn);
    this.handlers.set(method, list);
    return () => { const arr = this.handlers.get(method) || []; const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); };
  }

  send(method, params = {}, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时: ${method}`));
      }, timeoutMs ?? this.timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  async evaluate(sessionId, expression, timeoutMs) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    }, sessionId, timeoutMs ?? 120000);
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      const text = d.exception?.description || d.text || '脚本执行异常';
      throw new Error(text);
    }
    return result.result?.value;
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryConnect() {
  const { port, wsPath } = devtoolsEndpoint();
  const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  // 留足时间给你在 Edge 的授权确认里点“允许”（只弹一次，脚本不会重试）
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('连接浏览器调试端口超时')), 25000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
    ws.addEventListener('error', (ev) => { clearTimeout(timer); reject(new Error('无法连接浏览器调试端口: ' + (ev.message || 'error'))); });
  });
  const cdp = new Cdp(ws);
  // Verify the connection is live before returning it.
  await cdp.send('Target.getTargets');
  return cdp;
}

// 只连接一次，绝不自动重试。
// Edge/Chrome 在客户端连接浏览器级调试端点时会弹一次授权确认；自动重试会让用户
// 被同一个弹窗反复询问，所以重试必须由调用方显式开启（默认 1 次）。
async function connect(attempts = 1, gapMs = 2500) {
  if (attempts !== 1) {
    // 显式要求重试时（只在诊断脚本里用），仍限制在 3 次以内
    attempts = Math.min(Math.max(1, attempts), 3);
  }
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await tryConnect();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(gapMs);
    }
  }
  const err = lastError ?? new Error('连接浏览器调试端口失败');
  if (/超时|error/i.test(err.message)) {
    err.message += '（如果 Edge 弹出了远程调试授权确认，请点“允许”；本脚本不会自动重试，不会重复弹窗）';
  }
  throw err;
}

module.exports = { connect, Cdp, devtoolsEndpoint };
