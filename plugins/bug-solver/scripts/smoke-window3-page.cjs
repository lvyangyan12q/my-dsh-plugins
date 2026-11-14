'use strict';
// 窗口3 正式页（window3-dispatch.html）的 jsdom 冒烟。
// 目标：用假的 bug-solver 桥响应覆盖 UI 外部可观察行为，不依赖真实桥、不连服务器。
//
// 覆盖：B 轮次时间线、任务/对话切换、只读对话无输入/分页、needs_attention、
//       批准方案、Stop、桥未安装降级、API 失败态、确认页校验与派发、空态。
//
// 用法：node scripts/smoke-window3-page.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('./jsdom-resolve.cjs').resolveJsdom();

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'window3-dispatch.html');
const DRAFT_KEY = 'bugSolver.dispatchDraft';
const BASE = 'http://127.0.0.1:3080/window3-dispatch.html';

const html = fs.readFileSync(PAGE, 'utf8');
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ ok: true, name });
  } catch (e) {
    results.push({ ok: false, name, err: e && e.message ? e.message : String(e) });
  }
}

/* ------------------------------------------------------------------ */
/* 假桥：按路由返回 JSON，记录每次调用；可配置缺失/失败。              */
/* ------------------------------------------------------------------ */

function jsonBody(data) {
  return JSON.stringify(data);
}

function makeResponse(status, body, contentType) {
  const text = typeof body === 'string' ? body : jsonBody(body);
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? (contentType || 'application/json') : null;
      },
    },
    json: async function () { return JSON.parse(text); },
    text: async function () { return text; },
  };
}

function emptyRun(overrides) {
  const run = {
    version: 1,
    id: 'run-1',
    bugId: 'bug-3096',
    bugUid: 3096,
    bug: {
      id: 'bug-3096',
      uid: 3096,
      title: 'DCOM 消息通知发送 · 通讯录用户 region 为空',
      description: '工单通知人选择通讯录用户时飞书消息发送失败。',
      status: '待处理',
      priority: 0,
    },
    state: 'awaiting_plan_approval',
    specRef: { kind: 'file', path: 'specs/notify-feishu/spec.md', feature: 'notify-feishu' },
    fixSessionId: 'sess-fix-1111',
    reviewSessionId: 'sess-review-2222',
    currentRound: 2,
    rounds: [
      {
        round: 1,
        planRequestId: 'r1:plan',
        fixRequestId: 'r1:fix',
        reviewRequestId: 'r1:review',
        planPath: 'round-1/plan.md',
        planApprovedAt: 1790000000000,
        planFeedback: '',
        commit: '7c1e9a2',
        diffPath: 'round-1/diff.patch',
        verdict: 'request_changes',
        reviewPath: 'round-1/review.md',
        plan: {
          diagnosis: 'FeishuAppSender 直接使用 notifyUser.region 拼接口参数。',
          changes: ['工单通知链路补 region 来源', 'region 为空时给出明确错误'],
          tests: ['单测：region 为空 / 有地区 / 跨地区'],
          risk: '影响其他通知渠道的 region 解析，先只改飞书链路。',
        },
        review: {
          verdict: 'request_changes',
          summary: '方向对，但“region 为空回退默认地区”会掩盖配置错误。',
          blocking: ['region 为空时不要静默回退到默认地区', '补一条工单到飞书请求的集成测试'],
          tests: '建议补：region 缺失、跨地区、通讯录用户三种用例。',
        },
        completedAt: 1790000100000,
      },
      {
        round: 2,
        planRequestId: 'r2:plan',
        planPath: 'round-2/plan.md',
        planApprovedAt: 0,
        planFeedback: '',
        plan: {
          diagnosis: '接受审核意见：不静默回退，在 DTO 层校验 region。',
          changes: ['NotifyUserDTO：region 缺失返回明确校验错误'],
          tests: ['集成测试：工单 → 通知 → 飞书请求体'],
          risk: '错误信息变化可能影响前端提示。',
        },
      },
    ],
    commits: ['7c1e9a2'],
    branch: 'bugfix/3096-8f2a1c',
    baseBranch: 'master',
    artifacts: ['round-1/plan.md', 'round-1/diff.patch', 'round-1/review.md', 'round-2/plan.md'],
    retro: { state: 'pending', sessionId: null, reportPath: null },
    connection: {
      id: 'conn-test',
      name: '111',
      host: '10.12.139.111',
      port: '22',
      user: 'root',
      keyPath: 'C:\\Users\\Administrator\\.ssh\\id_ed25519',
    },
    project: {
      id: 'proj-api',
      name: 'cet-electric-api',
      localPath: 'F:\\ai-project\\cet-electric-api',
      remotePath: '/srv/cet-electric-api',
      repo: 'git@gitlab:cet-electric-api.git',
      defaultBranch: 'master',
    },
    error: null,
    createdAt: 1790000000000,
    updatedAt: 1790000200000,
    approvedAt: null,
  };
  return Object.assign(run, overrides || {});
}

const FIX_MESSAGES = {
  messages: [
    {
      seq: 10,
      at: 1790000200000,
      role: 'assistant',
      kind: 'plan',
      text: '第 2 轮方案：不静默回退，DTO 层校验 region。等你批准。',
      toolName: null,
    },
    {
      seq: 11,
      at: 1790000201000,
      role: 'tool',
      kind: 'tool',
      text: 'ssh root@10.12.139.111 "docker logs --since 2h docker-dcim-web-1"',
      toolName: 'ssh',
    },
    {
      seq: 12,
      at: 1790000202000,
      role: 'user',
      kind: 'text',
      text: '不要静默回退默认地区，先补集成测试。',
      toolName: null,
    },
  ],
  before: 10,
  hasMore: true,
};
const FIX_MESSAGES_OLDER = {
  messages: [
    { seq: 1, at: 1790000000000, role: 'user', kind: 'text', text: 'BUG-3096 派发：飞书消息发送失败。' },
    { seq: 2, at: 1790000005000, role: 'assistant', kind: 'text', text: '收到，先读代码和日志。' },
  ],
  before: 1,
  hasMore: false,
};

const REVIEW_MESSAGES = {
  messages: [
    {
      seq: 20,
      at: 1790000300000,
      role: 'assistant',
      kind: 'review',
      text: '审核结论：request_changes\n阻塞项：region 为空时不要静默回退。',
    },
    {
      seq: 21,
      at: 1790000301000,
      role: 'assistant',
      kind: 'text',
      text: '测试建议：补 region 缺失、跨地区两种用例。',
    },
  ],
  before: 1,
  hasMore: false,
};

// opts: { runs, run, messages, draft, missing, failures, startRun }
function makeBridge(opts) {
  opts = opts || {};
  const calls = [];
  const model = {
    runs: opts.runs !== undefined ? opts.runs : [emptyRun()],
    run: opts.run !== undefined ? opts.run : emptyRun(),
    messages: opts.messages || { fix: FIX_MESSAGES, fixOlder: FIX_MESSAGES_OLDER, review: REVIEW_MESSAGES },
  };
  const failures = opts.failures || {};

  function record(method, route, body) {
    calls.push({ method: method, route: route, body: body, url: route });
  }

  async function fetchImpl(input, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const raw = typeof input === 'string' ? input : input.url;
    const u = new URL(raw, BASE);
    const route = u.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    record(method, route + (u.search || ''), body);

    if (opts.missing) {
      return makeResponse(404, '<!doctype html><html><body>404 Not Found</body></html>', 'text/html');
    }

    const failKey = method + ' ' + route;
    if (failures[failKey]) {
      const f = failures[failKey];
      return makeResponse(f.status || 500, { error: f.error || 'bridge failed' });
    }

    if (method === 'GET' && route === '/api/bug-solver/runs') {
      return makeResponse(200, { runs: model.runs });
    }
    if (method === 'GET' && route === '/api/bug-solver/run') {
      const id = u.searchParams.get('id');
      if (id && id !== model.run.id) return makeResponse(404, { error: 'unknown run' });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'GET' && route === '/api/bug-solver/messages') {
      const role = u.searchParams.get('role') || 'fix';
      const before = u.searchParams.get('before');
      if (role === 'review') return makeResponse(200, model.messages.review);
      if (before === '10') return makeResponse(200, model.messages.fixOlder);
      return makeResponse(200, model.messages.fix);
    }
    if (method === 'GET' && route === '/api/bug-solver/artifact') {
      const name = u.searchParams.get('name') || '';
      const text = opts.artifactText || ('产物正文：' + name + '\nDTO 层校验 region。');
      return makeResponse(200, {
        name: name,
        size: Buffer.byteLength(text, 'utf8'),
        sha256: 'a'.repeat(64),
        text: text,
      });
    }
    if (method === 'POST' && route === '/api/bug-solver/writeback') {
      return makeResponse(200, { ok: true, path: 'data/ssh-config.json', version: 2, updated: {} });
    }
    if (method === 'POST' && route === '/api/bug-solver/resume') {
      const from = model.run && model.run.needsAttention && model.run.needsAttention.from;
      const next = from === 'fix_implementing'
        ? 'fix_implementing'
        : (from && String(from).indexOf('review') === 0 ? 'review_running' : 'fix_planning');
      model.run = Object.assign({}, model.run, { state: next, needsAttention: null });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'POST' && route === '/api/bug-solver/request-changes') {
      const round = Number(model.run.currentRound || 1) + 1;
      model.run = Object.assign({}, model.run, {
        state: 'fix_planning',
        currentRound: round,
        rounds: (model.run.rounds || []).concat([{ round: round, planPath: 'round-' + round + '/plan.md', planText: '第 ' + round + ' 轮方案（按再改意见）' }]),
        needsAttention: null,
      });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'POST' && route === '/api/bug-solver/start') {
      const run = emptyRun({ id: 'run-started', state: 'fix_planning', currentRound: 1, rounds: [] });
      if (body && body.bug) run.bug = body.bug;
      model.run = run;
      model.runs = [{ id: run.id, state: run.state, bugUid: run.bugUid, bugTitle: run.bug.title, currentRound: 1, updatedAt: 1790000400000 }];
      return makeResponse(201, { run: run });
    }
    if (method === 'POST' && route === '/api/bug-solver/approve-plan') {
      model.run = Object.assign({}, model.run, { state: 'fix_implementing' });
      model.run.rounds = (model.run.rounds || []).map(function (r) {
        return r.round === (body && body.round || model.run.currentRound) ? Object.assign({}, r, { planApprovedAt: 1790000500000 }) : r;
      });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'POST' && route === '/api/bug-solver/plan-feedback') {
      model.run = Object.assign({}, model.run, { state: 'fix_planning' });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'POST' && route === '/api/bug-solver/stop') {
      model.run = Object.assign({}, model.run, { state: 'stopped' });
      return makeResponse(200, { run: model.run });
    }
    if (method === 'POST' && route === '/api/bug-solver/approve') {
      model.run = Object.assign({}, model.run, { state: 'approved' });
      return makeResponse(200, { run: model.run });
    }
    return makeResponse(404, { error: 'unknown route' });
  }

  return { fetch: fetchImpl, calls: calls, model: model };
}

/* ------------------------------------------------------------------ */
/* 页面装载与断言工具                                                  */
/* ------------------------------------------------------------------ */

function loadPage(bridge, options) {
  options = options || {};
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push('jsdomError: ' + (e && e.message)); });
  vc.on('error', function (msg) { errors.push('console.error: ' + msg); });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: BASE + (options.search || ''),
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = bridge.fetch;
      if (options.draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(options.draft));
      if (options.draftMap) {
        window.localStorage.setItem(
          'bug-solver.dispatch.draft.v1',
          JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), drafts: options.draftMap }),
        );
      }
    },
  });
  return { dom: dom, errors: errors };
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function waitFor(fn, timeout) {
  const deadline = Date.now() + (timeout || 4000);
  while (Date.now() < deadline) {
    let value;
    try { value = fn(); } catch (e) { value = false; }
    if (value) return value;
    await sleep(15);
  }
  throw new Error('waitFor timeout');
}

async function ready(dom) {
  await waitFor(function () {
    return dom.window.document.documentElement.getAttribute('data-w3-ready') === '1';
  }, 5000);
}

function q(dom, sel) { return dom.window.document.querySelector(sel); }
function qa(dom, sel) { return Array.prototype.slice.call(dom.window.document.querySelectorAll(sel)); }
function text(dom, sel) { const el = q(dom, sel); return el ? el.textContent : ''; }
function app(dom) { return q(dom, '#app'); }

function click(dom, sel) {
  const el = q(dom, sel);
  assert.ok(el, '缺少元素 ' + sel);
  el.click();
}

function setInput(dom, sel, value) {
  const el = q(dom, sel);
  assert.ok(el, '缺少输入框 ' + sel);
  el.value = value;
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function posts(bridge, route) {
  return bridge.calls.filter(function (c) { return c.method === 'POST' && c.route.split('?')[0] === route; });
}

/* ------------------------------------------------------------------ */
/* 场景                                                                */
/* ------------------------------------------------------------------ */

async function scenarioTimeline() {
  const bridge = makeBridge({});
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('B 时间线：桥可用', function () {
      assert.strictEqual(app(dom).getAttribute('data-bridge'), 'ok');
      assert.ok(q(dom, '[data-card="timeline"]'), '没有时间线卡片');
    });
    check('B 时间线：run 摘要（缺陷/服务/分支/spec/状态）', function () {
      const summary = text(dom, '[data-card="stats"]') + text(dom, '[data-card="run-summary"]');
      assert.ok(/BUG-3096/.test(summary), '缺缺陷号');
      assert.ok(/cet-electric-api/.test(summary), '缺项目');
      assert.ok(/bugfix\/3096-8f2a1c/.test(summary), '缺分支');
      assert.ok(/notify-feishu/.test(summary), '缺 spec');
    });
    check('B 时间线：第 1 轮方案/实现/审核节点', function () {
      const plan = q(dom, '[data-node="round-1-plan"]');
      const impl = q(dom, '[data-node="round-1-implement"]');
      const review = q(dom, '[data-node="round-1-review"]');
      assert.ok(plan && impl && review, '缺第 1 轮节点');
      assert.strictEqual(plan.getAttribute('data-node-state'), 'done');
      assert.strictEqual(impl.getAttribute('data-node-state'), 'done');
      assert.strictEqual(review.getAttribute('data-node-state'), 'done');
      assert.ok(/第 1 轮/.test(plan.textContent), '方案节点没有轮次');
      assert.ok(/7c1e9a2/.test(impl.textContent), '实现节点缺 commit');
      assert.ok(/方向对/.test(review.textContent), '审核节点缺结论摘要');
      assert.ok(/阻塞项/.test(review.textContent), '审核节点缺阻塞项');
    });
    check('B 时间线：第 2 轮方案待确认 + 内嵌批准/退回', function () {
      const plan2 = q(dom, '[data-node="round-2-plan"]');
      assert.ok(plan2, '缺第 2 轮方案节点');
      assert.strictEqual(plan2.getAttribute('data-node-state'), 'current');
      assert.ok(/待你确认/.test(plan2.textContent), '未标待确认');
      assert.ok(/DTO 层校验 region/.test(plan2.textContent), '方案正文没渲染');
      assert.ok(q(dom, '[data-act="approve-plan"]'), '缺批准方案按钮');
      assert.ok(q(dom, '[data-act="toggle-feedback"]'), '缺退回修改按钮');
      assert.strictEqual(q(dom, '[data-act="approve-plan"]').disabled, false);
    });
    check('B 时间线：会话入口与产物清单', function () {
      assert.ok(q(dom, '[data-card="sessions"]'), '缺会话卡片');
      assert.ok(/sess-fix-1111/.test(text(dom, '[data-card="sessions"]')), '缺修复会话');
      assert.ok(/round-2\/plan\.md/.test(text(dom, '[data-card="artifacts"]')), '缺产物清单');
    });
    check('轮询：活跃 run 使用 1.5s', function () {
      assert.strictEqual(app(dom).getAttribute('data-poll'), '1500');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioApproveAndStop() {
  const bridge = makeBridge({});
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    click(dom, '[data-act="approve-plan"]');
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'fix_implementing'; });
    check('批准方案：调用 approve-plan 并进入实现中', function () {
      const calls = posts(bridge, '/api/bug-solver/approve-plan');
      assert.strictEqual(calls.length, 1, 'approve-plan 调用次数不对');
      assert.strictEqual(calls[0].body.runId, 'run-1');
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'fix_implementing');
      assert.ok(/实现中/.test(text(dom, '[data-node="round-2-implement"]')), '实现节点没进入实现中');
      assert.ok(!q(dom, '[data-act="approve-plan"]'), '批准按钮应消失');
    });
    click(dom, '[data-act="stop"]');
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'stopped'; });
    check('Stop：调用 stop 并进入已停止', function () {
      const calls = posts(bridge, '/api/bug-solver/stop');
      assert.strictEqual(calls.length, 1, 'stop 调用次数不对');
      assert.strictEqual(calls[0].body.runId, 'run-1');
      assert.ok(q(dom, '[data-card="stopped"]'), '缺已停止卡片');
      assert.ok(/已停止/.test(text(dom, '[data-card="stopped"]')));
      assert.ok(/新 run/.test(text(dom, '[data-card="stopped"]')), '缺新开 run 说明');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioChat() {
  const bridge = makeBridge({});
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    click(dom, '[data-view="chat"]');
    await waitFor(function () { return app(dom).getAttribute('data-view') === 'chat'; });
    await waitFor(function () { return qa(dom, '[data-msg]').length >= 3; });
    check('对话：任务/对话切换后为只读镜像', function () {
      assert.strictEqual(app(dom).getAttribute('data-view'), 'chat');
      assert.ok(q(dom, '[data-card="chat"]'), '缺对话卡片');
      assert.ok(q(dom, '[data-readonly-banner]'), '缺只读提示');
      assert.ok(/只读/.test(text(dom, '[data-readonly-banner]')));
      assert.ok(/在 DSH 打开并回复/.test(text(dom, '[data-card="chat"]')));
    });
    check('对话：没有任何输入框/发送/审批按钮', function () {
      const chat = q(dom, '[data-card="chat"]');
      assert.strictEqual(chat.querySelectorAll('input, textarea, [contenteditable="true"]').length, 0, '出现了输入控件');
      assert.strictEqual(chat.querySelectorAll('[data-act="send"], [data-act="approve-plan"], [data-act="approve"], [data-act="stop"]').length, 0, '出现了写操作按钮');
    });
    check('对话：区分 agent 文本、工具调用、你的回答', function () {
      const msgs = qa(dom, '[data-msg]');
      assert.ok(msgs.some(function (m) { return m.getAttribute('data-role') === 'assistant' && m.getAttribute('data-kind') === 'plan'; }), '缺方案消息');
      const tool = msgs.filter(function (m) { return m.getAttribute('data-kind') === 'tool'; })[0];
      assert.ok(tool, '缺工具调用消息');
      assert.ok(/ssh/.test(tool.textContent), '工具调用没显示命令');
      assert.ok(msgs.some(function (m) { return m.getAttribute('data-role') === 'user' && /你的回答/.test(m.textContent); }), '缺你的回答标识');
    });
    check('对话：初始加载最新一页（不带 before）', function () {
      assert.ok(q(dom, '[data-act="load-more"]'), '缺加载更早按钮');
      const list = q(dom, '[data-chat-list]');
      assert.strictEqual(list.getAttribute('data-has-more'), '1');
      assert.ok(!/before=/.test(bridge.calls.filter(function (c) {
        return c.route.indexOf('/api/bug-solver/messages') === 0;
      })[0].route), '首页不应带 before');
    });
    click(dom, '[data-act="load-more"]');
    await waitFor(function () { return qa(dom, '[data-msg]').length >= 5; });
    check('对话：加载更早用 before 向前翻并前置', function () {
      const calls = bridge.calls.filter(function (c) { return c.route.indexOf('/api/bug-solver/messages') === 0; });
      assert.ok(calls.some(function (c) { return /before=10/.test(c.route); }), '没带 before 请求更早消息');
      assert.ok(/BUG-3096 派发/.test(text(dom, '[data-chat-list]')), '更早消息没出现');
      assert.strictEqual(q(dom, '[data-chat-list]').getAttribute('data-has-more'), '0');
    });
    click(dom, '[data-chat-role="review"]');
    await waitFor(function () { return app(dom).getAttribute('data-chat-role') === 'review'; });
    await waitFor(function () { return /审核结论/.test(text(dom, '[data-chat-list]')); });
    check('对话：切到审核角色', function () {
      const role = q(dom, '[data-chat-role="review"]');
      assert.ok(role, '缺审核页签');
      assert.ok(/审核结论/.test(text(dom, '[data-chat-list]')));
      assert.ok(/role=review/.test(lastMessagesCall(bridge)), '审核请求缺 role=review');
    });
    click(dom, '[data-view="task"]');
    await waitFor(function () { return app(dom).getAttribute('data-view') === 'task'; });
    check('对话：切回任务视图仍有时间线', function () {
      assert.ok(q(dom, '[data-card="timeline"]'));
      assert.strictEqual(q(dom, '[data-card="chat"]'), null);
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioNeedsAttention() {
  const run = emptyRun({
    state: 'needs_attention',
    needsAttention: {
      from: 'fix_planning',
      code: 'blocked',
      message: '容器名 docker-dcim-web-1 没有匹配到项目，需要你确认。',
      reason: '容器名 docker-dcim-web-1 没有匹配到项目，需要你确认。',
      sessionId: 'sess-fix-1111',
    },
  });
  const bridge = makeBridge({ run: run });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('needs_attention：显示需要你回复 + 原因', function () {
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'needs_attention');
      const card = q(dom, '[data-card="needs-attention"]');
      assert.ok(card, '缺需要你回复卡片');
      assert.ok(/需要你回复/.test(card.textContent));
      assert.ok(/没有匹配到项目/.test(card.textContent), '缺原因');
      assert.ok(/不替你回答/.test(card.textContent), '缺不代替回答说明');
    });
    check('needs_attention：只有会话入口，没有输入框', function () {
      const card = q(dom, '[data-card="needs-attention"]');
      assert.strictEqual(card.querySelectorAll('input, textarea, [contenteditable="true"]').length, 0);
      assert.ok(card.querySelector('[data-act="open-session"]'), '缺在 DSH 打开');
      assert.ok(card.querySelector('[data-act="stop"]'), '缺 Stop');
      assert.strictEqual(card.querySelectorAll('[data-act="approve-plan"], [data-act="send"]').length, 0);
    });
    check('needs_attention：空闲轮询 10s', function () {
      assert.strictEqual(app(dom).getAttribute('data-poll'), '10000');
    });
    click(dom, '[data-act="resume"]');
    await waitFor(function () { return posts(bridge, '/api/bug-solver/resume').length === 1; });
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'fix_planning'; });
    check('needs_attention：可手动继续，调用 resume 并回到暂停阶段', function () {
      const call = posts(bridge, '/api/bug-solver/resume')[0];
      assert.strictEqual(call.body.runId, 'run-1');
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'fix_planning');
      assert.strictEqual(q(dom, '[data-card="needs-attention"]'), null, '暂停卡片应消失');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioDegraded() {
  const bridge = makeBridge({ missing: true });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('降级：桥未安装明确提示', function () {
      assert.strictEqual(app(dom).getAttribute('data-bridge'), 'degraded');
      const banner = q(dom, '[data-bridge-banner]');
      assert.ok(banner, '缺降级提示');
      assert.strictEqual(banner.getAttribute('data-kind'), 'degraded');
      assert.ok(/桥未安装/.test(banner.textContent), '提示没写桥未安装');
      assert.ok(/示例/.test(banner.textContent), '没说明是示例数据');
      assert.ok(q(dom, '[data-act="retry-bridge"]'), '缺重新检测');
    });
    check('降级：显示示例时间线且标注示例', function () {
      assert.strictEqual(app(dom).getAttribute('data-sample'), '1');
      const timeline = q(dom, '[data-card="timeline"]');
      assert.ok(timeline, '降级时没有示例时间线');
      assert.ok(q(dom, '[data-node="round-1-plan"]'), '示例缺第 1 轮方案节点');
      assert.ok(/示例/.test(timeline.textContent), '时间线没有示例标注');
    });
    check('降级：写操作禁用，不假装已派发', function () {
      const approve = q(dom, '[data-act="approve-plan"]');
      const stop = q(dom, '[data-act="stop"]');
      assert.ok(approve && approve.disabled, '批准方案应禁用');
      assert.ok(stop && stop.disabled, 'Stop 应禁用');
      approve.click();
      assert.strictEqual(posts(bridge, '/api/bug-solver/approve-plan').length, 0, '降级时不应发请求');
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'awaiting_plan_approval', '降级时状态不应改变');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioApiError() {
  const bridge = makeBridge({
    failures: { 'POST /api/bug-solver/approve-plan': { status: 500, error: 'state store unavailable' } },
  });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    click(dom, '[data-act="approve-plan"]');
    await waitFor(function () { return !!q(dom, '[data-notice][data-kind="error"]'); });
    check('API 失败：显示错误、状态不变、可重试', function () {
      const notice = q(dom, '[data-notice]');
      assert.ok(/失败|HTTP 500/.test(notice.textContent), '错误提示不明确：' + notice.textContent);
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'awaiting_plan_approval', '失败时不应假装进入实现');
      const approve = q(dom, '[data-act="approve-plan"]');
      assert.ok(approve, '失败后批准按钮应还在');
      assert.strictEqual(approve.disabled, false, '失败后按钮不应卡在忙碌态');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

function sampleDraft() {
  return {
    runId: 'run-draft-1',
    bug: {
      id: 'bug-3096',
      uid: 3096,
      title: 'DCOM 消息通知发送 · 通讯录用户 region 为空',
      description: '工单通知人选择通讯录用户时飞书消息发送失败。',
      status: '待处理',
      priority: 0,
    },
    connection: {
      id: 'conn-test',
      name: '111',
      host: '10.12.139.111',
      port: '22',
      user: 'root',
      keyPath: 'C:\\Users\\Administrator\\.ssh\\id_ed25519',
    },
    project: {
      id: 'proj-api',
      name: 'cet-electric-api',
      localPath: '',
      remotePath: '/srv/cet-electric-api',
      repo: 'git@gitlab:cet-electric-api.git',
      defaultBranch: 'master',
    },
    specRef: { kind: 'file', path: 'specs/notify-feishu/spec.md', feature: 'notify-feishu' },
    container: 'docker-dcim-web-1',
    timeWindow: { from: '2026-10-27T00:00:00+08:00', to: '2026-10-27T06:00:00+08:00' },
    notes: '只复现于工单通知；通讯录用户没有地区字段。',
    source: { window: '窗口1', pane: 'p1' },
  };
}

async function scenarioConfirm() {
  const bridge = makeBridge({ runs: [] });
  const page = loadPage(bridge, { draft: sampleDraft() });
  const dom = page.dom;
  try {
    await ready(dom);
    check('确认页：带出缺陷/SSH/项目/spec/容器/时间窗/补充说明', function () {
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'draft');
      const card = q(dom, '[data-card="confirm"]');
      assert.ok(card, '缺确认卡片');
      assert.ok(/BUG-3096/.test(card.textContent), '缺缺陷摘要');
      assert.ok(q(dom, '[data-field="localPath"]'), '缺本地仓库路径');
      assert.ok(/notify-feishu/.test(q(dom, '[data-field="specPath"]').value), 'spec 没带出');
      assert.strictEqual(q(dom, '[data-field="container"]').value, 'docker-dcim-web-1');
      assert.ok(q(dom, '[data-field="notes"]').value.length > 0, '补充说明没带出');
      assert.ok(q(dom, '[data-field="baseBranch"]'), '缺基线分支字段');
    });
    check('确认页：缺 localPath 时校验失败、派发禁用', function () {
      assert.ok(q(dom, '[data-check="localPath"]'), '缺校验行');
      assert.strictEqual(q(dom, '[data-check="localPath"]').getAttribute('data-ok'), '0');
      assert.strictEqual(q(dom, '[data-act="confirm-dispatch"]').disabled, true, '无效表单不应可派发');
    });
    setInput(dom, '[data-field="localPath"]', 'F:\\ai-project\\cet-electric-api');
    await waitFor(function () { return q(dom, '[data-act="confirm-dispatch"]').disabled === false; });
    check('确认页：补齐后校验通过、派发可用', function () {
      assert.strictEqual(q(dom, '[data-check="localPath"]').getAttribute('data-ok'), '1');
      assert.strictEqual(q(dom, '[data-act="confirm-dispatch"]').disabled, false);
    });
    click(dom, '[data-act="confirm-dispatch"]');
    await waitFor(function () { return posts(bridge, '/api/bug-solver/start').length === 1; });
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'fix_planning'; });
    check('确认页：派发带完整草稿、进入方案阶段、草稿清除', function () {
      const body = posts(bridge, '/api/bug-solver/start')[0].body;
      assert.strictEqual(body.bug.uid, 3096);
      assert.strictEqual(body.connection.id, 'conn-test');
      assert.strictEqual(body.project.localPath, 'F:\\ai-project\\cet-electric-api');
      assert.strictEqual(body.specRef.path, 'specs/notify-feishu/spec.md');
      assert.strictEqual(body.container, 'docker-dcim-web-1');
      assert.ok(body.notes.length > 0);
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'fix_planning');
      assert.ok(q(dom, '[data-card="timeline"]'), '派发后没时间线');
      assert.ok(/方案生成中/.test(text(dom, '[data-card="timeline"]')), '没进方案生成态');
      assert.strictEqual(dom.window.localStorage.getItem(DRAFT_KEY), null, '草稿没清除');
      assert.strictEqual(q(dom, '[data-card="confirm"]'), null, '派发后确认页应消失');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioDispatchFailure() {
  const bridge = makeBridge({
    runs: [],
    failures: { 'POST /api/bug-solver/start': { status: 500, error: 'cannot start session' } },
  });
  const page = loadPage(bridge, { draft: sampleDraft() });
  const dom = page.dom;
  try {
    await ready(dom);
    setInput(dom, '[data-field="localPath"]', 'F:\\ai-project\\cet-electric-api');
    await waitFor(function () { return q(dom, '[data-act="confirm-dispatch"]').disabled === false; });
    click(dom, '[data-act="confirm-dispatch"]');
    await waitFor(function () { return !!q(dom, '[data-notice][data-kind="error"]'); });
    check('派发失败：明确报错、仍在确认页、不假装已派发', function () {
      const notice = q(dom, '[data-notice]');
      assert.ok(/派发失败|HTTP 500/.test(notice.textContent), '错误提示不明确：' + notice.textContent);
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'draft');
      assert.ok(q(dom, '[data-card="confirm"]'), '失败后应留在确认页');
      assert.ok(dom.window.localStorage.getItem(DRAFT_KEY), '失败后草稿不应丢');
      assert.strictEqual(q(dom, '[data-act="confirm-dispatch"]').disabled, false, '失败后应可重试');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioFinalApprove() {
  const run = emptyRun({
    state: 'awaiting_user_approval',
    currentRound: 2,
    rounds: [
      emptyRun().rounds[0],
      Object.assign({}, emptyRun().rounds[1], {
        planApprovedAt: 1790000300000,
        commit: 'a1b2c3d',
        diffPath: 'round-2/diff.patch',
        verdict: 'approve',
        reviewPath: 'round-2/review.md',
        review: { verdict: 'approve', summary: 'region 缺失路径有明确错误，集成测试覆盖。', blocking: [], tests: '后续补跨地区模板变量。' },
        completedAt: 1790000400000,
      }),
    ],
  });
  const bridge = makeBridge({ run: run });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('待通过：显示最终确认与复盘入口前提', function () {
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'awaiting_user_approval');
      assert.ok(q(dom, '[data-card="final"]'), '缺最终确认卡片');
      assert.ok(q(dom, '[data-act="approve"]'), '缺通过按钮');
      assert.ok(/a1b2c3d/.test(text(dom, '[data-card="final"]')), '缺 commit');
    });
    click(dom, '[data-act="approve"]');
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'approved'; });
    check('通过：调用 approve 并显示去复盘', function () {
      const calls = posts(bridge, '/api/bug-solver/approve');
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].body.runId, 'run-1');
      assert.ok(q(dom, '[data-card="approved"]'), '缺已通过卡片');
      assert.ok(q(dom, '[data-act="retro"]'), '缺去复盘按钮');
      assert.ok(/复盘/.test(text(dom, '[data-card="approved"]')));
      assert.ok(/不会自动合入/.test(text(dom, '[data-card="approved"]')));
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioArtifactViewer() {
  const run = emptyRun({ artifacts: ['round-1/plan.md', 'round-1/review.md'] });
  const bridge = makeBridge({ run: run });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('产物：查看/下载入口存在', function () {
      assert.ok(q(dom, '[data-card="artifacts"] [data-act="view-artifact"]'), '缺查看按钮');
      const link = q(dom, '[data-artifact-download]');
      assert.ok(link, '缺下载链接');
      assert.ok(/name=round-1%2Fplan\.md/.test(link.getAttribute('href')), '下载链接缺产物名');
      assert.ok(/download=1/.test(link.getAttribute('href')), '下载链接缺 download=1');
    });
    click(dom, '[data-act="view-artifact"]');
    await waitFor(function () { return q(dom, '[data-artifact-viewer] pre'); });
    check('产物：只读查看正文', function () {
      const viewer = q(dom, '[data-artifact-viewer]');
      assert.ok(/round-1\/plan\.md/.test(viewer.textContent), '缺产物名');
      assert.ok(/DTO 层校验 region/.test(viewer.textContent), '缺产物正文：' + viewer.textContent);
      assert.ok(/sha256/.test(viewer.textContent), '缺 sha256 摘要');
      const call = bridge.calls.filter(function (c) { return c.route.indexOf('/api/bug-solver/artifact') === 0; })[0];
      assert.ok(call && /name=round-1%2Fplan\.md/.test(call.route));
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioDraftMap() {
  const draft = sampleDraft();
  const bridge = makeBridge({ runs: [] });
  const page = loadPage(bridge, { draftMap: { 'bug-3096': draft } });
  const dom = page.dom;
  try {
    await ready(dom);
    check('v1 map：窗口3 读取按 bugId 的草稿', function () {
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'draft');
      assert.ok(/BUG-3096/.test(text(dom, '[data-card="confirm"]')), '没带出 v1 map 草稿');
    });
    setInput(dom, '[data-field="localPath"]', 'F:\\ai-project\\cet-electric-api');
    await waitFor(function () { return q(dom, '[data-act="confirm-dispatch"]').disabled === false; });
    click(dom, '[data-act="confirm-dispatch"]');
    await waitFor(function () { return posts(bridge, '/api/bug-solver/start').length === 1; });
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'fix_planning'; });
    check('仓库/分支：派发不再写回窗口2，成功后清掉该 bugId 与兼容键', function () {
      assert.strictEqual(posts(bridge, '/api/bug-solver/writeback').length, 0, '不再调用窗口2 写回');
      const start = posts(bridge, '/api/bug-solver/start');
      assert.strictEqual(start.length, 1);
      assert.strictEqual(start[0].body.project.localPath, 'F:\\ai-project\\cet-electric-api');
      // 基线分支不再默认 master：草稿没给就发空串，由桥用仓库当前分支（HEAD）。
      assert.strictEqual(start[0].body.project.baseBranch, '');
      const map = JSON.parse(dom.window.localStorage.getItem('bug-solver.dispatch.draft.v1') || '{"drafts":{}}');
      assert.deepStrictEqual(Object.keys(map.drafts), [], '该 bugId 的 v1 草稿应清除');
      assert.strictEqual(dom.window.localStorage.getItem('bug-solver.dispatchDraft'), null);
      assert.strictEqual(dom.window.localStorage.getItem('bugSolver.window3Draft'), null);
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioRequestChanges() {
  const base = emptyRun();
  const run = emptyRun({
    state: 'awaiting_user_approval',
    currentRound: 2,
    rounds: [
      base.rounds[0],
      Object.assign({}, base.rounds[1], {
        planApprovedAt: 1790000300000,
        commit: 'a1b2c3d',
        verdict: 'approve',
        review: { verdict: 'approve', summary: '已通过。', blocking: [], tests: [] },
      }),
    ],
  });
  const bridge = makeBridge({ run: run });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    click(dom, '[data-act="toggle-feedback"]');
    await waitFor(function () { return q(dom, '[data-act="submit-request-changes"]'); });
    setInput(dom, '[data-field="plan-feedback"]', '再补一条跨地区测试');
    click(dom, '[data-act="submit-request-changes"]');
    await waitFor(function () { return posts(bridge, '/api/bug-solver/request-changes').length === 1; });
    await waitFor(function () { return app(dom).getAttribute('data-phase') === 'fix_planning'; });
    check('要求再改：调用 request-changes 而非 plan-feedback，进入下一轮方案', function () {
      const calls = posts(bridge, '/api/bug-solver/request-changes');
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].body.runId, 'run-1');
      assert.strictEqual(calls[0].body.note, '再补一条跨地区测试');
      assert.strictEqual(posts(bridge, '/api/bug-solver/plan-feedback').length, 0);
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'fix_planning');
      assert.ok(q(dom, '[data-node="round-3-plan"]'), '应出现第 3 轮方案节点');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioBridgeShape() {
  // 桥 publicRun 的真实字段形状：planText 字符串 + review 对象（没有旧的 reviewBlocking）。
  const run = emptyRun({
    state: 'review_done',
    currentRound: 1,
    rounds: [{
      round: 1,
      planPath: 'round-1/plan.md',
      planText: '# 第 1 轮方案\n先改 DTO 校验 region',
      planApprovedAt: 1790000000000,
      fixRequestId: 'r1:fix',
      reviewRequestId: 'r1:review',
      commit: '7c1e9a2',
      verdict: 'request_changes',
      review: {
        verdict: 'request_changes',
        summary: '方向对，但缺少边界测试。',
        blocking: ['补一条 region 缺失的集成测试'],
        tests: ['region 缺失 / 跨地区'],
        path: 'round-1/review.md',
      },
    }],
    plan: '# 第 1 轮方案\n先改 DTO 校验 region',
    review: {
      verdict: 'request_changes',
      summary: '方向对，但缺少边界测试。',
      blocking: ['补一条 region 缺失的集成测试'],
      tests: ['region 缺失 / 跨地区'],
      path: 'round-1/review.md',
    },
  });
  const bridge = makeBridge({ run: run });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('桥字段契约：planText 正文与 review{summary,blocking,tests} 直接可渲染', function () {
      const plan = q(dom, '[data-node="round-1-plan"]');
      const review = q(dom, '[data-node="round-1-review"]');
      assert.ok(plan && /先改 DTO 校验 region/.test(plan.textContent), 'planText 没渲染');
      assert.ok(review && /方向对/.test(review.textContent), 'review.summary 没渲染');
      assert.ok(/补一条 region 缺失的集成测试/.test(review.textContent), 'review.blocking 没渲染');
      assert.ok(/跨地区/.test(review.textContent), 'review.tests 没渲染');
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioEmpty() {
  const bridge = makeBridge({ runs: [] });
  const page = loadPage(bridge);
  const dom = page.dom;
  try {
    await ready(dom);
    check('空态：没有 run 也没有草稿时给出下一步', function () {
      assert.strictEqual(app(dom).getAttribute('data-phase'), 'none');
      const card = q(dom, '[data-card="empty"]');
      assert.ok(card, '缺空态');
      assert.ok(/窗口1/.test(card.textContent), '空态没说明从窗口1 派发');
      assert.ok(/派发/.test(card.textContent));
    });
  } finally {
    dom.window.close();
  }
  return page.errors;
}

async function scenarioScrollRetention() {
  const run = emptyRun({ state: 'awaiting_plan_approval' });
  run.rounds[1].planText = '方案正文\n'.repeat(150);
  delete run.rounds[1].plan;
  const page = loadPage(makeBridge({ run }));
  const dom = page.dom;
  try {
    await ready(dom);
    const selector = '[data-node="round-2-plan"] .w3-prose';
    const before = q(dom, selector);
    assert.ok(before, '方案正文不存在');
    before.scrollTop = 180;
    before.scrollLeft = 12;
    await waitFor(() => q(dom, selector) !== before, 4000);
    check('轮询刷新保留同一方案正文的滚动位置', function () {
      assert.strictEqual(q(dom, selector).scrollTop, 180);
      assert.strictEqual(q(dom, selector).scrollLeft, 12);
    });
  } finally { dom.window.close(); }
  return page.errors;
}

function lastMessagesCall(bridge) {
  const calls = bridge.calls.filter(function (c) { return c.route.indexOf('/api/bug-solver/messages') === 0; });
  return calls.length ? calls[calls.length - 1].route : '';
}

/* ------------------------------------------------------------------ */

(async function main() {
  const allErrors = [];
  const scenarios = [
    ['timeline', scenarioTimeline],
    ['approve-stop', scenarioApproveAndStop],
    ['chat', scenarioChat],
    ['needs', scenarioNeedsAttention],
    ['degraded', scenarioDegraded],
    ['api-error', scenarioApiError],
    ['confirm', scenarioConfirm],
    ['dispatch-failure', scenarioDispatchFailure],
    ['final-approve', scenarioFinalApprove],
    ['artifacts', scenarioArtifactViewer],
    ['draft-map', scenarioDraftMap],
    ['request-changes', scenarioRequestChanges],
    ['bridge-shape', scenarioBridgeShape],
    ['empty', scenarioEmpty],
    ['scroll-retention', scenarioScrollRetention],
  ];
  for (const [name, fn] of scenarios) {
    try {
      const errs = await fn();
      (errs || []).forEach(function (e) { allErrors.push(name + ': ' + e); });
    } catch (e) {
      results.push({ ok: false, name: name + ' 场景异常', err: e && e.stack ? e.stack : String(e) });
      allErrors.push(name + ': ' + (e && e.message ? e.message : e));
    }
  }
  check('页面无脚本错误', function () {
    assert.deepStrictEqual(allErrors.filter(function (e) { return /jsdomError|console\.error/.test(e); }), []);
  });

  const failed = results.filter(function (r) { return !r.ok; });
  results.forEach(function (r) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n      ' + r.err));
  });
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (allErrors.length) console.log('页面错误：\n' + allErrors.join('\n'));
  process.exit(failed.length ? 1 : 0);
})();
