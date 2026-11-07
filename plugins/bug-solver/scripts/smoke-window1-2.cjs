'use strict';
// 窗口1/2 冒烟（IM03）：jsdom 跑真实页面，断言外部可观察行为。
// 覆盖：
//  - 窗口1：「处理」派发到窗口3（localStorage 草稿 / BroadcastChannel / 队列文件，队列失败降级）
//  - 窗口1：标题仍开详情；按 bugId 幂等；已有活跃 run 不重复派发；列表/筛选不崩
//  - 窗口2：v1→v2 迁移；localPath 校验（绝对路径/存在/git 仓库）；serviceMap 保存读回与校验
//  - 窗口2：原列表/连接/矩阵能力不崩
// 用法：node scripts/smoke-window1-2.cjs
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('./jsdom-resolve.cjs').resolveJsdom();

const ROOT = path.resolve(__dirname, '..');
const DRAFT_KEY = 'bug-solver.dispatch.draft.v1';
const results = [];
let failed = 0;

// 窗口2 已收敛为「只配 SSH 连接」；项目/localPath/服务映射/矩阵/分支已迁到窗口3，
// 旧断言保留为 SKIP，避免误报。
const SKIP_WINDOW2_PROJECT = [
  /窗口2：.*(服务映射|serviceMap|关联矩阵|矩阵|分支|校验路径|localPath|项目)/,
  /窗口2：.*(迁移后保存写回|保存文件 version|保存保留|相对路径|路径不存在|非 git 仓库)/,
];
function ok(name, cond, extra) {
  if (SKIP_WINDOW2_PROJECT.some((re) => re.test(name))) {
    results.push('SKIP ' + name + '（窗口2 项目配置已移除）');
    return;
  }
  const pass = !!cond;
  if (!pass) failed += 1;
  results.push((pass ? 'PASS ' : 'FAIL ') + name + (pass || !extra ? '' : '  [' + extra + ']'));
}
function res(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body == null ? null : JSON.parse(JSON.stringify(body)); },
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}
function jsonRes(body, status) { return res(status || 200, body); }
async function waitFor(fn, ms = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v = false;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}
function textOf(doc, sel) {
  const el = doc.querySelector(sel);
  return el ? el.textContent : '';
}
function fire(win, node, type) {
  node.dispatchEvent(new win.Event(type, { bubbles: true }));
}
function setInput(win, node, value) {
  node.value = value;
  fire(win, node, 'input');
}
function setSelect(win, node, value) {
  node.value = value;
  fire(win, node, 'change');
}

/* ============================ 窗口1：tb-bugs ============================ */
function bugsFixture() {
  const pid = 'p-demo';
  const person = 'u-1';
  return {
    'data/projects.json': {
      projects: [{ id: pid, name: '演示项目' }],
      priorities: { 0: { name: '普通', color: 'blue' }, 1: { name: '紧急', color: 'red' } },
    },
    'data/control.json': {
      enabled: true, projectId: pid, projectName: '演示项目', personId: person, personName: '周泽宇',
      intervalMinutes: 10, updatedAt: '2026-10-27T08:00:00.000Z',
    },
    ['data/members/' + pid + '.json']: { projectId: pid, members: [{ id: person, name: '周泽宇' }] },
    ['data/bugs/' + pid + '__' + person + '.json']: {
      projectId: pid, personId: person, pulledAt: '2026-10-27T08:00:00.000Z',
      bugs: [
        {
          id: 'bug-1', uid: 3083, t: '登录页偶发白屏', st: '待处理', pr: 1, sd: false,
          note: '客户反馈：登录后页面白屏，刷新恢复。联系邮箱 a@b.com',
          updated: '2026-10-27T07:00:00.000Z', created: '2026-10-26T07:00:00.000Z', cr: '张三', ex: '周泽宇',
          cf: [{ n: '环境', v: '测试' }],
          env: { services: ['dcom-web-test830:v1.0.97'], hosts: ['10.12.139.111'], hints: ['测试'] },
          repo: ['git@git.cet-electric.com:web/web.git'],
        },
        { id: 'bug-2', uid: 3090, t: '报表导出超时', st: '修复中', pr: 0, sd: false, note: '导出 5 万行超时', updated: '2026-10-26T07:00:00.000Z' },
        { id: 'bug-3', uid: 3091, t: '历史已解决缺陷', st: '已解决', pr: 0, sd: true, note: '旧问题', updated: '2026-10-20T07:00:00.000Z' },
      ],
    },
  };
}

function buildBugsDom(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'tb-bugs.html'), 'utf8');
  const data = Object.assign({}, opts.data || bugsFixture());
  if (opts.sshConfig) data['data/ssh-config.json'] = opts.sshConfig;
  const errors = [];
  const errorsJsdom = [];
  const writes = [];
  const broadcasts = [];
  const runsReply = opts.runs || { runs: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errorsJsdom.push(String(e && e.message ? e.message : e)));
  vc.on('error', (m) => errors.push(String(m)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:3080/api/worktable/project/F-demo/tb-bugs.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async (url, init) => {
        const u = String(url);
        if (u.indexOf('/api/worktable/write') >= 0) {
          let body = null;
          try { body = JSON.parse(init && init.body); } catch { body = null; }
          writes.push(body);
          return res(opts.queueWriteStatus || 200, { ok: (opts.queueWriteStatus || 200) < 300 });
        }
        if (u.indexOf('/api/bug-solver/runs') >= 0) {
          if (opts.bridgeUnavailable) return res(404, { error: 'not found' });
          return jsonRes(runsReply);
        }
        if (u.indexOf('127.0.0.1:47821/health') >= 0) return res(0, null);
        for (const key of Object.keys(data)) {
          if (u.indexOf(key) >= 0) return jsonRes(data[key]);
        }
        return res(404, null);
      };
      window.BroadcastChannel = class FakeBroadcastChannel {
        constructor(name) { this.name = name; }
        postMessage(msg) { broadcasts.push({ name: this.name, msg }); }
        close() {}
      };
      window.WebSocket = class FakeWebSocket {
        constructor(url) {
          this.url = url;
          this.readyState = 0;
          setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen({}); }, 0);
        }
        send() { /* 拉取路径在冒烟里不触发 */ }
        close() {}
      };
      window.open = () => ({});
    },
  });

  return { dom, window: dom.window, document: dom.window.document, writes, broadcasts, errors: errors.concat(errorsJsdom) };
}

async function testBugs() {
  // ---------- 基础渲染 + 标题开详情 ----------
  const a = buildBugsDom();
  const { document, window } = a;
  await waitFor(() => document.querySelectorAll('.row').length === 2);
  ok('窗口1：列表渲染 3 条未完成缺陷（含 2 条 open）', document.querySelectorAll('.row').length === 2,
    'rows=' + document.querySelectorAll('.row').length);
  ok('窗口1：列表显示编号与标题', /#3083/.test(textOf(document, '.list')) && /登录页偶发白屏/.test(textOf(document, '.list')));
  ok('窗口1：行内「派发」按钮存在', !!document.querySelector('.handleBtn[data-handle="bug-1"]'));

  document.querySelector('.row .title').click();
  await waitFor(() => document.querySelector('.dTitle'));
  ok('窗口1：点标题仍打开原详情', /登录页偶发白屏/.test(textOf(document, '.dTitle')), textOf(document, '.dTitle'));
  ok('窗口1：详情保留复制入口（处理信息面板）', !!document.getElementById('togglePanel'));
  ok('窗口1：详情有「派发到窗口3」按钮', !!document.querySelector('[data-action="dispatch-detail"]'));
  document.getElementById('ovBack').click();

  // ---------- 派发：localStorage + 广播 + 队列 ----------
  document.querySelector('.handleBtn[data-handle="bug-1"]').click();
  const stored = await waitFor(() => {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : false;
  });
  ok('窗口1：处理写入 localStorage 草稿', !!stored && !!(stored.drafts && stored.drafts['bug-1']), JSON.stringify(stored));
  const draft = stored && stored.drafts && stored.drafts['bug-1'];
  ok('窗口1：草稿带缺陷信息', !!draft && draft.bug.uid === 3083 && draft.bug.title === '登录页偶发白屏' && /白屏/.test(draft.bug.description));
  ok('窗口1：草稿带来源与 runId', !!draft && draft.runId && draft.source && draft.source.window === '窗口1');
  ok('窗口1：BroadcastChannel 收到草稿通知', a.broadcasts.some((b) => b.name === 'bug-solver.dispatch.v1' && b.msg && b.msg.draft && b.msg.draft.bug.id === 'bug-1'),
    JSON.stringify(a.broadcasts.map((b) => b.msg && b.msg.type)));
  const queueWrite = await waitFor(() => a.writes.find((w) => w && /queue\.json$/.test(String(w.path).replace(/\\/g, '/'))));
  ok('窗口1：向 data/dispatch/queue.json 写队列', !!queueWrite, JSON.stringify(a.writes.map((w) => w && w.path)));
  ok('窗口1：队列内容包含该缺陷', !!queueWrite && /bug-1/.test(queueWrite.content));
  ok('窗口1：派发反馈「已发送 / 等待确认」',
    /已发送|已更新/.test(textOf(document, '#notice')) && /等待确认/.test(textOf(document, '#notice')),
    textOf(document, '#notice'));
  ok('窗口1：行内按钮显示已发送状态', (document.querySelector('.handleBtn[data-handle="bug-1"]') || {}).getAttribute?.('data-state') === 'sent');

  // ---------- 幂等：再点一次更新草稿，不新增 ----------
  const runId1 = draft ? draft.runId : null;
  document.querySelector('.handleBtn[data-handle="bug-1"]').click();
  await waitFor(() => {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.drafts['bug-1'] && draft && s.drafts['bug-1'].updatedAt !== draft.updatedAt;
  });
  const stored2 = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '{"drafts":{}}');
  ok('窗口1：幂等——草稿数量仍为 1', Object.keys(stored2.drafts).length === 1, Object.keys(stored2.drafts).join(','));
  ok('窗口1：幂等——复用同一 runId', !!stored2.drafts['bug-1'] && stored2.drafts['bug-1'].runId === runId1);

  // ---------- 筛选不崩 ----------
  const search = document.getElementById('search');
  setInput(window, search, '报表');
  await waitFor(() => document.querySelectorAll('.row').length === 1);
  ok('窗口1：搜索筛选正常', document.querySelectorAll('.row').length === 1);
  setInput(window, search, '');
  await waitFor(() => document.querySelectorAll('.row').length === 2);
  ok('窗口1：清空搜索恢复列表', document.querySelectorAll('.row').length === 2);

  // ---------- 队列写失败：只留 localStorage，不假装成功 ----------
  const b = buildBugsDom({ queueWriteStatus: 500 });
  await waitFor(() => b.document.querySelectorAll('.row').length === 2);
  b.document.querySelector('.handleBtn[data-handle="bug-2"]').click();
  const localOnly = await waitFor(() => {
    const raw = b.window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : false;
  });
  ok('窗口1：队列失败仍保留本机草稿', !!localOnly && !!localOnly.drafts['bug-2']);
  const noticeB = await waitFor(() => {
    const t = textOf(b.document, '#notice');
    return /未写入|仅本机|本机草稿|降级/.test(t) ? t : false;
  });
  ok('窗口1：队列失败给出降级提示（不假装成功）', !!noticeB && !/已保存到/.test(noticeB), textOf(b.document, '#notice'));
  ok('窗口1：队列失败时按钮状态为待确认', (b.document.querySelector('.handleBtn[data-handle="bug-2"]') || {}).getAttribute?.('data-state') === 'local');

  // ---------- 已有活跃 run：不重复派发 ----------
  const c = buildBugsDom({ runs: { runs: [{ id: 'run-1', bugId: 'bug-1', bugUid: 3083, state: 'fix_planning' }] } });
  await waitFor(() => c.document.querySelectorAll('.row').length === 2);
  c.document.querySelector('.handleBtn[data-handle="bug-1"]').click();
  const activeNotice = await waitFor(() => {
    const t = textOf(c.document, '#notice');
    return /进行中|活跃|已在运行/.test(t) ? t : false;
  });
  ok('窗口1：已有活跃 run 时提示', !!activeNotice, textOf(c.document, '#notice'));
  const cStore = c.window.localStorage.getItem(DRAFT_KEY);
  const cDrafts = cStore ? JSON.parse(cStore).drafts : {};
  ok('窗口1：有活跃 run 时不新建草稿', Object.keys(cDrafts).length === 0, JSON.stringify(cDrafts));

  // ---------- 桥不可用：照常落本机草稿，不报错 ----------
  const d = buildBugsDom({ bridgeUnavailable: true });
  await waitFor(() => d.document.querySelectorAll('.row').length === 2);
  d.document.querySelector('.handleBtn[data-handle="bug-2"]').click();
  const dStore = await waitFor(() => {
    const raw = d.window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : false;
  });
  ok('窗口1：桥不可用时仍写入本机草稿', !!dStore && !!dStore.drafts['bug-2']);

  // ---------- 详情里的「派发到窗口3」 ----------
  const e = buildBugsDom();
  await waitFor(() => e.document.querySelectorAll('.row').length === 2);
  e.document.querySelector('.row .title').click();
  await waitFor(() => e.document.querySelector('[data-action="dispatch-detail"]'));
  clickSel(e, '[data-action="dispatch-detail"]');
  const eStore = await waitFor(() => {
    const raw = e.window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : false;
  });
  ok('窗口1：详情里「派发到窗口3」也写草稿', !!eStore && !!eStore.drafts['bug-1']);

  // ---------- 带出窗口2 配置 + 与窗口3 页面兼容的草稿交接 ----------
  const f = buildBugsDom({
    sshConfig: {
      version: 2,
      connections: [{ id: 'conn-test', name: '测试服务器', host: '10.12.139.111', port: '22', user: 'root', key: '~/.ssh/id_ed25519', isDefault: true }],
      projects: [{ id: 'proj-web', name: 'dcom-web', localPath: 'F:\\ai-project\\dcom-web', remotePath: '/srv/www/dcom-web', repo: 'git@x:web.git', defaultBranch: 'master' }],
      links: [{ connectionId: 'conn-test', projectId: 'proj-web' }],
      serviceMap: [{ match: ['dcom-web'], projectId: 'proj-web', container: 'docker-dcom-web-1' }],
    },
  });
  await waitFor(() => f.document.querySelectorAll('.row').length === 2);
  f.document.querySelector('.handleBtn[data-handle="bug-1"]').click();
  const fStore = await waitFor(() => {
    const raw = f.window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : false;
  });
  const fDraft = fStore && fStore.drafts && fStore.drafts['bug-1'];
  ok('窗口1：草稿带出窗口2 匹配的连接与项目', !!fDraft &&
    fDraft.project && fDraft.project.id === 'proj-web' &&
    fDraft.connection && fDraft.connection.host === '10.12.139.111' &&
    fDraft.connection.keyPath === '~/.ssh/id_ed25519', fDraft && JSON.stringify({ p: fDraft.project, c: fDraft.connection }));
  ok('窗口1：草稿带出 serviceMap 容器', !!fDraft && fDraft.container === 'docker-dcom-web-1', fDraft && fDraft.container);
  ok('窗口1：草稿带候选连接 / 项目列表', !!fDraft && fDraft.connections.length === 1 && fDraft.projects.length === 1);
  const compatRaw = f.window.localStorage.getItem('bugSolver.dispatchDraft');
  ok('窗口1：写窗口3 兼容单草稿键', !!compatRaw && JSON.parse(compatRaw).bug && JSON.parse(compatRaw).bug.id === 'bug-1');
  ok('窗口1：窗口3 兼容频道收到 dispatch（开着的窗口3 立即接手）',
    f.broadcasts.some((b) => b.name === 'bug-solver-dispatch' && b.msg && b.msg.type === 'dispatch' && b.msg.draft && b.msg.draft.bug.id === 'bug-1'),
    JSON.stringify(f.broadcasts.map((b) => b.name)));

  // ---------- 与窗口3 页面的草稿交接（IM02 文件在集成分支里时） ----------
  const w3File = path.join(ROOT, 'window3-dispatch.html');
  if (fs.existsSync(w3File)) {
    const compat = f.window.localStorage.getItem('bugSolver.dispatchDraft');
    const w3 = buildWindow3Dom(compat);
    const shown = await waitFor(() => {
      const t = textOf(w3.document, '#app');
      return /登录页偶发白屏/.test(t) && /10\.12\.139\.111/.test(t) ? t : false;
    }, 4000);
    ok('窗口1→窗口3：草稿交接带出缺陷 / 连接 / 项目',
      !!shown && /dcom-web/.test(shown), shown && shown.slice(0, 160));
    ok('窗口3 页面无脚本错误', w3.errors.length === 0, w3.errors.join(' | '));
    try { w3.dom.window.close(); } catch { /* ignore */ }
  }

  [a, b, c, d, e, f].forEach((x, i) => ok('窗口1：无脚本错误（实例 ' + (i + 1) + '）', x.errors.length === 0, x.errors.join(' | ')));
  [a, b, c, d, e, f].forEach((x) => { try { x.dom.window.close(); } catch { /* ignore */ } });
}

/* ============================ 窗口3 交接 ============================ */
function buildWindow3Dom(compatDraft) {
  const html = fs.readFileSync(path.join(ROOT, 'window3-dispatch.html'), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && e.message ? e.message : e)));
  vc.on('error', (m) => errors.push(String(m)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:3080/api/worktable/project/F-demo/window3-dispatch.html',
    virtualConsole: vc,
    beforeParse(window) {
      try { if (compatDraft) window.localStorage.setItem('bugSolver.dispatchDraft', compatDraft); } catch { /* ignore */ }
      window.fetch = async () => res(404, null);
      window.BroadcastChannel = class { constructor(name) { this.name = name; } postMessage() {} close() {} };
      window.WebSocket = class { constructor() { setTimeout(() => { if (this.onopen) this.onopen({}); }, 0); } send() {} close() {} };
    },
  });
  return { dom, window: dom.window, document: dom.window.document, errors };
}

/* ============================ 窗口2：ssh-config ============================ */
function v1Config() {
  return {
    version: 1,
    updatedAt: '2026-10-26T08:00:00.000Z',
    connections: [{ id: 'conn-test', name: '测试服务器', host: '10.12.139.111', port: '22', user: 'root', key: '~/.ssh/id_ed25519', isDefault: true, lastTestOk: true, lastTestAt: '2026-10-26T08:00:00.000Z', lastTestMsg: 'ok' }],
    projects: [{ id: 'proj-web', name: 'dcom-web', repo: 'git@git.cet-electric.com:web/web.git', remotePath: '/srv/www/dcom-web', defaultBranch: 'master', branches: ['master', 'develop'], note: '前端' }],
    links: [{ connectionId: 'conn-test', projectId: 'proj-web' }],
  };
}

function buildConfigDom(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'ssh-config.html'), 'utf8');
  const errors = [];
  const errorsJsdom = [];
  const writes = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errorsJsdom.push(String(e && e.message ? e.message : e)));
  vc.on('error', (m) => errors.push(String(m)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:3080/api/worktable/project/F-demo/ssh-config.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async (url, init) => {
        const u = String(url);
        if (u.indexOf('/api/worktable/write') >= 0) {
          let body = null;
          try { body = JSON.parse(init && init.body); } catch { body = null; }
          writes.push(body);
          return res(opts.writeStatus || 200, { ok: true });
        }
        if (u.indexOf('ssh-config.json') >= 0) {
          if (opts.config == null) return res(404, null);
          return jsonRes(opts.config);
        }
        return res(404, null);
      };
      window.WebSocket = class FakeWebSocket {
        constructor(url) {
          this.url = url;
          setTimeout(() => { if (this.onopen) this.onopen({}); }, 0);
        }
        send() {
          setTimeout(() => {
            if (this.onmessage) this.onmessage({ data: '\r\nWB_PATH_' + (opts.pathResult || 'OK') + '\r\n' });
          }, 0);
        }
        close() {}
      };
    },
  });
  return { dom, window: dom.window, document: dom.window.document, writes, errors: errors.concat(errorsJsdom) };
}

async function testConfig() {
  // ---------- 空配置（首次使用）不崩 ----------
  const aEmpty = buildConfigDom({ config: null });
  await waitFor(() => aEmpty.document.querySelector('[data-action="new-conn"]'));
  ok('窗口2：无配置文件时从空配置开始（不报错）',
    !/配置加载失败/.test(textOf(aEmpty.document, '#root')) && !!aEmpty.document.querySelector('[data-action="new-conn"]'),
    textOf(aEmpty.document, '#root').slice(0, 80));

  // ---------- v1 → v2 迁移 ----------
  const a = buildConfigDom({ config: v1Config() });
  await waitFor(() => a.document.querySelector('[data-action="tab"][data-value="proj"]'));
  ok('窗口2：旧 v1 配置加载不报错（连接列表渲染）', a.document.querySelectorAll('.ma-item').length === 1,
    a.document.querySelectorAll('.ma-item').length);
  const migrationNotice = textOf(a.document, '.notice');
  ok('窗口2：v1 加载提示迁移', /v1|迁移|升级/.test(migrationNotice), migrationNotice);
  ok('窗口2：迁移后版本为 2', /v2|version 2/.test(migrationNotice), migrationNotice);

  clickSel(a, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => a.document.querySelector('[data-field="localPath"]'));
  const lpA = a.document.querySelector('[data-field="localPath"]');
  ok('窗口2：代码项目有「本地仓库路径」字段', !!lpA);
  ok('窗口2：v1 项目 localPath 补空值', !!lpA && lpA.value === '', lpA && lpA.value);

  clickSel(a, '[data-action="save-proj"]');
  const migrated = await waitFor(() => a.writes.find((w) => w && /ssh-config\.json$/.test(String(w.path).replace(/\\/g, '/'))));
  ok('窗口2：迁移后保存写回 v2', !!migrated);
  const savedDoc = migrated ? JSON.parse(migrated.content) : null;
  ok('窗口2：保存文件 version=2', !!savedDoc && savedDoc.version === 2, savedDoc && String(savedDoc.version));
  ok('窗口2：保存保留 connections/projects/links',
    !!savedDoc && savedDoc.connections.length === 1 && savedDoc.projects.length === 1 && savedDoc.links.length === 1);
  ok('窗口2：保存项目含 localPath 字段', !!savedDoc && savedDoc.projects[0] &&
    Object.prototype.hasOwnProperty.call(savedDoc.projects[0], 'localPath'));
  ok('窗口2：保存文件含顶层 serviceMap 数组', !!savedDoc && Array.isArray(savedDoc.serviceMap));

  // ---------- localPath 校验 ----------
  setField(a, '[data-field="localPath"]', 'relative/path');
  clickSel(a, '[data-action="save-proj"]');
  const relErr = await waitFor(() => {
    const t = textOf(a.document, '[data-err="localPath"]');
    return /绝对路径/.test(t) ? t : false;
  });
  ok('窗口2：相对路径报「绝对路径」', !!relErr, textOf(a.document, '[data-err="localPath"]'));

  const aBad = buildConfigDom({ config: v1Config(), pathResult: 'MISS' });
  await waitFor(() => aBad.document.querySelector('[data-action="tab"][data-value="proj"]'));
  clickSel(aBad, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aBad.document.querySelector('[data-field="localPath"]'));
  setField(aBad, '[data-field="localPath"]', 'F:\\ai-project\\demo-repo');
  clickSel(aBad, '[data-action="save-proj"]');
  const missErr = await waitFor(() => {
    const t = textOf(aBad.document, '[data-err="localPath"]');
    return /不存在|未找到/.test(t) ? t : false;
  });
  ok('窗口2：路径不存在时报错', !!missErr, textOf(aBad.document, '[data-err="localPath"]'));
  ok('窗口2：路径不存在时不保存', aBad.writes.length === 0, JSON.stringify(aBad.writes.map((w) => w && w.path)));

  const aGit = buildConfigDom({ config: v1Config(), pathResult: 'NOGIT' });
  await waitFor(() => aGit.document.querySelector('[data-action="tab"][data-value="proj"]'));
  clickSel(aGit, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aGit.document.querySelector('[data-field="localPath"]'));
  setField(aGit, '[data-field="localPath"]', 'F:\\ai-project\\demo-repo');
  clickSel(aGit, '[data-action="save-proj"]');
  const gitErr = await waitFor(() => {
    const t = textOf(aGit.document, '[data-err="localPath"]');
    return /git/.test(t) ? t : false;
  });
  ok('窗口2：非 git 仓库时报错', !!gitErr, textOf(aGit.document, '[data-err="localPath"]'));
  ok('窗口2：非 git 仓库时不保存', aGit.writes.length === 0, JSON.stringify(aGit.writes.map((w) => w && w.path)));

  // 合法路径保存并写回
  const aOk = buildConfigDom({ config: v1Config(), pathResult: 'OK' });
  await waitFor(() => aOk.document.querySelector('[data-action="tab"][data-value="proj"]'));
  clickSel(aOk, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aOk.document.querySelector('[data-field="localPath"]'));
  setField(aOk, '[data-field="localPath"]', 'F:\\ai-project\\demo-repo');
  clickSel(aOk, '[data-action="save-proj"]');
  const okWrite = await waitFor(() => aOk.writes.find((w) => w && /ssh-config\.json$/.test(String(w.path).replace(/\\/g, '/'))));
  const okDoc = okWrite ? JSON.parse(okWrite.content) : null;
  ok('窗口2：校验通过的 localPath 保存写回', !!okDoc && okDoc.projects[0].localPath === 'F:\\ai-project\\demo-repo',
    okDoc && okDoc.projects && okDoc.projects[0] && okDoc.projects[0].localPath);
  ok('窗口2：清空错误提示', !/绝对路径|不存在|git 仓库/.test(textOf(aOk.document, '[data-err="localPath"]')));

  // 「校验路径」按钮：只校验、不保存
  const aChk = buildConfigDom({ config: v1Config(), pathResult: 'OK' });
  await waitFor(() => aChk.document.querySelector('[data-action="tab"][data-value="proj"]'));
  clickSel(aChk, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aChk.document.querySelector('[data-field="localPath"]'));
  setField(aChk, '[data-field="localPath"]', 'F:\\ai-project\\demo-repo');
  clickSel(aChk, '[data-action="check-path"]');
  const chkOk = await waitFor(() => {
    const input = aChk.document.querySelector('[data-field="localPath"]');
    const label = input ? input.closest('label') : null;
    const t = label ? label.textContent : '';
    return (/通过|存在/.test(t) ? t : false);
  });
  ok('窗口2：校验路径按钮通过时提示存在', !!chkOk, chkOk);
  ok('窗口2：只校验不写盘', aChk.writes.length === 0, JSON.stringify(aChk.writes.map((w) => w && w.path)));

  const aChkBad = buildConfigDom({ config: v1Config(), pathResult: 'NOGIT' });
  await waitFor(() => aChkBad.document.querySelector('[data-action="tab"][data-value="proj"]'));
  clickSel(aChkBad, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aChkBad.document.querySelector('[data-field="localPath"]'));
  setField(aChkBad, '[data-field="localPath"]', 'F:\\ai-project\\demo-repo');
  clickSel(aChkBad, '[data-action="check-path"]');
  const chkBad = await waitFor(() => {
    const t = textOf(aChkBad.document, '[data-err="localPath"]');
    return /git/.test(t) ? t : false;
  });
  ok('窗口2：校验路径按钮失败时提示原因', !!chkBad, textOf(aChkBad.document, '[data-err="localPath"]'));

  // ---------- serviceMap 编辑 / 校验 / 保存 / 读回 ----------
  const aMap = buildConfigDom({ config: v1Config() });
  await waitFor(() => aMap.document.querySelector('[data-action="tab"][data-value="map"]'));
  const mapTab = aMap.document.querySelector('[data-action="tab"][data-value="map"]');
  ok('窗口2：有「服务映射」页签', !!mapTab);
  if (mapTab) mapTab.click();
  await waitFor(() => aMap.document.querySelector('[data-action="add-map"]'));
  clickSel(aMap, '[data-action="add-map"]');
  await waitFor(() => aMap.document.querySelector('[data-map-field="match"]'));
  setField(aMap, '[data-map-field="match"]', 'visitor-management');
  setField(aMap, '[data-map-field="container"]', 'docker-visitor-management-1');
  setField(aMap, '[data-map-field="project"]', 'proj-web');
  clickSel(aMap, '[data-action="save-map"]');
  const mapWrite = await waitFor(() => aMap.writes.find((w) => w && /ssh-config\.json$/.test(String(w.path).replace(/\\/g, '/'))));
  const mapDoc = mapWrite ? JSON.parse(mapWrite.content) : null;
  ok('窗口2：serviceMap 保存写回', !!mapDoc && Array.isArray(mapDoc.serviceMap) && mapDoc.serviceMap.length === 1,
    mapDoc && JSON.stringify(mapDoc.serviceMap));
  ok('窗口2：serviceMap 内容正确', !!mapDoc && !!(mapDoc.serviceMap && mapDoc.serviceMap[0]) &&
    mapDoc.serviceMap[0].projectId === 'proj-web' &&
    (mapDoc.serviceMap[0].match || []).indexOf('visitor-management') >= 0 &&
    mapDoc.serviceMap[0].container === 'docker-visitor-management-1', mapDoc && JSON.stringify(mapDoc.serviceMap));

  // 读回：把写出的文件喂给新实例
  if (mapDoc) {
    const aRe = buildConfigDom({ config: mapDoc });
    await waitFor(() => aRe.document.querySelector('[data-action="tab"][data-value="map"]'));
    clickSel(aRe, '[data-action="tab"][data-value="map"]');
    await waitFor(() => aRe.document.querySelector('[data-map-field="match"]'));
    const reMatch = aRe.document.querySelector('[data-map-field="match"]');
    const reContainer = aRe.document.querySelector('[data-map-field="container"]');
    const reProject = aRe.document.querySelector('[data-map-field="project"]');
    ok('窗口2：serviceMap 读回（match/container/project）',
      !!reMatch && !!reContainer && !!reProject &&
      reMatch.value === 'visitor-management' &&
      reContainer.value === 'docker-visitor-management-1' &&
      reProject.value === 'proj-web',
      reMatch && reMatch.value);
    ok('窗口2：无脚本错误（serviceMap 读回实例）', aRe.errors.length === 0, aRe.errors.join(' | '));
    try { aRe.dom.window.close(); } catch { /* ignore */ }
  }

  // 空值 / 重复校验
  const aDup = buildConfigDom({ config: v1Config() });
  await waitFor(() => aDup.document.querySelector('[data-action="tab"][data-value="map"]'));
  clickSel(aDup, '[data-action="tab"][data-value="map"]');
  await waitFor(() => aDup.document.querySelector('[data-action="add-map"]'));
  clickSel(aDup, '[data-action="add-map"]');
  await waitFor(() => aDup.document.querySelector('[data-map-field="match"]'));
  clickSel(aDup, '[data-action="save-map"]');
  const emptyErr = await waitFor(() => {
    const t = textOf(aDup.document, '[data-map-err="0"]');
    return /必填|至少/.test(t) ? t : false;
  });
  ok('窗口2：serviceMap 空值校验', !!emptyErr, textOf(aDup.document, '[data-map-err="0"]'));
  ok('窗口2：serviceMap 空值不保存', aDup.writes.length === 0, JSON.stringify(aDup.writes.map((w) => w && w.path)));

  setField(aDup, '[data-map-field="match"]', 'dcom-web');
  setField(aDup, '[data-map-field="project"]', 'proj-web');
  clickSel(aDup, '[data-action="add-map"]');
  await waitFor(() => aDup.document.querySelectorAll('[data-map-field="match"]').length === 2);
  const dupMatches = aDup.document.querySelectorAll('[data-map-field="match"]');
  const dupProjects = aDup.document.querySelectorAll('[data-map-field="project"]');
  if (dupMatches[1]) setInput(aDup.window, dupMatches[1], 'dcom-web');
  if (dupProjects[1]) setSelect(aDup.window, dupProjects[1], 'proj-web');
  clickSel(aDup, '[data-action="save-map"]');
  const dupErr = await waitFor(() => {
    const t = textOf(aDup.document, '[data-map-err="1"]') || textOf(aDup.document, '[data-map-err="0"]');
    return /重复/.test(t) ? t : false;
  });
  ok('窗口2：serviceMap 重复关键字校验', !!dupErr, textOf(aDup.document, '[data-map-err="1"]'));

  // ---------- 原有能力不崩 ----------
  const aKeep = buildConfigDom({ config: v1Config() });
  await waitFor(() => aKeep.document.querySelector('[data-action="test-conn"]'));
  ok('窗口2：连接页渲染编辑表单', !!aKeep.document.querySelector('[data-field="host"]') && !!aKeep.document.querySelector('[data-action="test-conn"]'));
  ok('窗口2：测试连接按钮文案正常', /测试连接/.test(textOf(aKeep.document, '[data-action="test-conn"]')));
  clickSel(aKeep, '[data-action="tab"][data-value="proj"]');
  await waitFor(() => aKeep.document.querySelector('[data-action="read-branches"]'));
  ok('窗口2：分支读取入口仍在', !!aKeep.document.querySelector('[data-action="read-branches"]'));
  ok('窗口2：分支列表渲染', /master/.test(textOf(aKeep.document, '.branchRow')));
  clickSel(aKeep, '[data-action="tab"][data-value="matrix"]');
  await waitFor(() => aKeep.document.querySelector('.mx-cell'));
  ok('窗口2：关联矩阵渲染', !!aKeep.document.querySelector('.mx-cell.on'));
  clickSel(aKeep, '.mx-cell');
  const linkWrite = await waitFor(() => aKeep.writes.find((w) => w && /ssh-config\.json$/.test(String(w.path).replace(/\\/g, '/'))));
  const linkDoc = linkWrite ? JSON.parse(linkWrite.content) : null;
  ok('窗口2：矩阵点击即时保存（links 变化）', !!linkDoc && Array.isArray(linkDoc.links) && linkDoc.links.length === 0,
    linkDoc && JSON.stringify(linkDoc.links));

  [aEmpty, a, aBad, aGit, aOk, aChk, aChkBad, aMap, aDup, aKeep].forEach((x, i) => ok('窗口2：无脚本错误（实例 ' + (i + 1) + '）', x.errors.length === 0, x.errors.join(' | ')));
  [aEmpty, a, aBad, aGit, aOk, aChk, aChkBad, aMap, aDup, aKeep].forEach((x) => { try { x.dom.window.close(); } catch { /* ignore */ } });
}

function clickSel(inst, sel) {
  const el = inst.document.querySelector(sel);
  if (!el) return false;
  el.click();
  return true;
}
function setField(inst, sel, value) {
  const el = inst.document.querySelector(sel);
  if (!el) return false;
  if (el.tagName === 'SELECT') setSelect(inst.window, el, value);
  else setInput(inst.window, el, value);
  return true;
}

(async () => {
  await testBugs();
  await testConfig();
  console.log(results.join('\n'));
  console.log('\n' + (results.length - failed) + '/' + results.length + ' 通过' + (failed ? '，' + failed + ' 失败' : ''));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('smoke crashed:', e && e.stack ? e.stack : e);
  console.log(results.join('\n'));
  process.exit(1);
});
