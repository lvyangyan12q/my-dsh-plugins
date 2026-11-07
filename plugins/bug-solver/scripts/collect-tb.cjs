'use strict';
// TB 缺陷采集（按“选中项目 + 选中负责人”拉取，经 Edge DevTools 已登录会话，只读 GET）。
//
// 由 Windows 计划任务每分钟触发一次；每次运行是短进程，采集完即退出。
// 开关与选择由窗口写入 data/control.json 控制：
//   - enabled=false        → 只写 state 后退出，不连浏览器、不访问 TB
//   - 项目/人员变化或距上次拉取 >= intervalMinutes → 拉取一次
//
// 产物：
//   data/projects.json                      项目列表 + 组织/优先级映射（缺失或超 24h 刷新）
//   data/members/<projectId>.json           项目成员（缺失或超 6h 刷新）
//   data/bugs/<projectId>__<personId>.json  选中人的缺陷明细
//   data/state.json                         最近一次运行状态（窗口读取）
//   data/collector.log                      运行日志
//
// 页面内执行的函数用 fn.toString() 注入到 TB 标签页，仅做同源只读 GET。
const fs = require('node:fs');
const path = require('node:path');
const { connect } = require('./cdp-lib.cjs');

const TB_ORIGIN = 'https://tb.cet-electric.com:4753';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MEMBERS_DIR = path.join(DATA_DIR, 'members');
const BUGS_DIR = path.join(DATA_DIR, 'bugs');
const CONTROL_FILE = path.join(DATA_DIR, 'control.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const LOG_FILE = path.join(DATA_DIR, 'collector.log');
const LOCK_FILE = path.join(DATA_DIR, '.collector.lock');
const DEFAULT_INTERVAL_MIN = 10;
const PROJECTS_TTL_MS = 24 * 60 * 60 * 1000;
const MEMBERS_TTL_MS = 6 * 60 * 60 * 1000;

function stamp() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWrite(file, content) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
  fs.renameSync(tmp, file);
}

function log(line) {
  try {
    ensureDir(DATA_DIR);
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) {
      fs.rmSync(LOG_FILE + '.1', { force: true });
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
    fs.appendFileSync(LOG_FILE, stamp() + ' ' + line + '\n', 'utf8');
  } catch { /* ignore */ }
}

function writeState(state) {
  atomicWrite(STATE_FILE, JSON.stringify(state, null, 1));
}

function mark(ok) {
  try { console.log('TB-PULL-DONE ' + (ok ? 'ok' : 'fail')); } catch { /* ignore */ }
  process.exitCode = ok ? 0 : 1;
  // 给终端/管道一点时间写完标记，然后强制退出，避免残留的调试连接让进程挂住
  setTimeout(() => process.exit(ok ? 0 : 1), 80);
}

function acquireLock() {
  ensureDir(DATA_DIR);
  const write = () => fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: stamp() }), { flag: 'wx' });
  try {
    write();
    return true;
  } catch {
    try {
      const info = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (Date.now() - new Date(info.at || 0).getTime() > 5 * 60 * 1000) {
        fs.rmSync(LOCK_FILE, { force: true });
        write();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }
}

function releaseLock() {
  try { fs.rmSync(LOCK_FILE, { force: true }); } catch { /* ignore */ }
}

/* ---------- 以下函数在 TB 页面上下文中执行（fn.toString() 注入） ---------- */

function tbFetchProjects() {
  const getJson = async (p) => {
    const r = await fetch(p, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + p + ' ' + t.slice(0, 120));
    try { return JSON.parse(t); } catch { throw new Error('响应不是 JSON：' + p); }
  };
  const rowsOf = (js) => (Array.isArray(js) ? js : (js && Array.isArray(js.result) ? js.result : []));
  return (async () => {
    const me = await getJson('/api/users/me').catch(() => null);
    const orgs = rowsOf(await getJson('/api/organizations?pageSize=50'));
    const org = orgs[0];
    if (!org) throw new Error('无法获取组织信息');
    const projects = rowsOf(await getJson('/api/v3/projects?_organizationId=' + encodeURIComponent(org._id) + '&pageSize=1000&orderBy=updated'));
    const priorities = {};
    try {
      const groups = rowsOf(await getJson('/api/organizations/' + org._id + '/prioritygroups'));
      for (const g of groups) {
        for (const o of (g.options || [])) priorities[String(o.priority)] = { name: o.name, color: o.color || null };
      }
    } catch { /* ignore */ }
    return {
      updatedAt: new Date().toISOString(),
      org: { id: org._id, name: org.name },
      me: me ? { id: me._id, name: me.name } : null,
      priorities,
      projects: projects
        .map((p) => ({ id: p._id, name: p.name, archived: p.isArchived === true }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    };
  })();
}

function tbFetchMembers(pid) {
  return (async () => {
    const r = await fetch('/api/projects/' + pid + '/projectfakerolemembers', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' 成员');
    let j;
    try { j = JSON.parse(t); } catch { throw new Error('成员响应不是 JSON'); }
    const rows = Array.isArray(j) ? j : (j.result || []);
    const seen = new Set();
    const members = [];
    for (const m of rows) {
      const uid = m._userId || (m.user && m.user._id);
      const name = m.name || (m.user && m.user.name);
      if (!uid || !name || seen.has(uid)) continue;
      seen.add(uid);
      members.push({ id: uid, name });
    }
    members.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return members;
  })();
}

function tbFetchBugs(pid, uid, fieldDefsUrl) {
  const getJson = async (p) => {
    const r = await fetch(p, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + p + ' ' + t.slice(0, 120));
    try { return JSON.parse(t); } catch { throw new Error('响应不是 JSON：' + p); }
  };
  const rowsOf = (js) => (Array.isArray(js) ? js : (js && Array.isArray(js.result) ? js.result : []));
  const cleanText = (v, limit) => {
    if (v == null) return '';
    let s = String(v);
    s = s.replace(/\\([\[\]*_~#+\-.!()])/g, '$1');
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[图片\]/g, '').replace(/\r/g, '');
    s = s.replace(/\*\*|__|`{1,3}/g, '');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s.slice(0, limit);
  };
  const cfValue = (c) => {
    const raw = Array.isArray(c.value) ? c.value : (Array.isArray(c.values) ? c.values : (c.value == null ? [] : [c.value]));
    const parts = [];
    for (const item of raw) {
      if (item == null) continue;
      const t = typeof item === 'string' ? item : (item.title != null ? item.title : (item.value != null ? item.value : (item.name != null ? item.name : '')));
      if (t) parts.push(String(t));
    }
    return parts.join(' / ').slice(0, 180);
  };
  return (async () => {
    let fieldDefs = {};
    try {
      const fd = rowsOf(await getJson(fieldDefsUrl));
      for (const row of fd) {
        const cf = row.customfield || row;
        if (cf && cf._id) fieldDefs[cf._id] = cf.name || cf._id;
      }
    } catch { /* 字段名缺失时忽略 */ }

    const filter = "taskType = bug AND executorId = '" + uid + "'";
    const q = new URLSearchParams({ filter, pageSize: '2000', myVisible: 'true' });
    const res = await getJson('/api/v2/projects/' + pid + '/tasks?' + q.toString());
    const rows = rowsOf(res);
    const total = typeof res.totalSize === 'number' ? res.totalSize : rows.length;
    const warnings = [];
    if (res.nextPageToken) warnings.push('存在下一页标记，可能未取全（返回 ' + rows.length + ' / 总数 ' + total + '）');
    else if (total > rows.length) warnings.push('返回 ' + rows.length + ' / 总数 ' + total + '，可能未取全');

    const bugs = rows.map((t) => {
      const ex = t.executor || null;
      const cr = t.creator || null;
      const st = t.taskflowstatus || null;
      const cfg = t.scenariofieldconfig || null;
      const cfs = [];
      const rtfText = [];
      for (const c of t.customfields || []) {
        const defName = fieldDefs[c._customfieldId];
        const type = String(c.type || '').toLowerCase();
        if (type === 'rtf') {
          const raw = Array.isArray(c.value) ? c.value : (c.value ? [c.value] : []);
          for (const item of raw) {
            if (item && typeof item.title === 'string' && item.title.trim()) rtfText.push(item.title.trim());
          }
          continue;
        }
        if (['file', 'image', 'attachment', 'lookup'].includes(type)) continue;
        const v = cfValue(c);
        if (v) cfs.push({ n: defName || c._customfieldId, v });
      }

      // 从问题描述/富文本/字段里提取「环境服务信息」与「代码库信息」（能提就提，提不到留空）
      const uniq = (arr) => Array.from(new Set(arr));
      const pool = [t.content || '', t.note || '']
        .concat(cfs.map((c) => c.n + '：' + c.v))
        .concat(rtfText.slice(0, 6))
        .join('\n');
      const ips = uniq((pool.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])).slice(0, 10);
      const urls = uniq((pool.match(/https?:\/\/[^\s"'<>（）)]+/g) || [])).slice(0, 10);
      const repos = uniq((pool.match(/(?:git@[\w.-]+:[\w.\/-]+|https?:\/\/[^\s"'<>（）)]*?(?:gitlab|github|gerrit|bitbucket|gitee)[^\s"'<>（）)]*)/gi) || [])).slice(0, 8);
      const repoLines = pool.split(/\n/).filter((l) => /代码库|源码|仓库|repo|git/i.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 180)).filter(Boolean);
      const envLines = pool.split(/\n/).filter((l) => /(服务器|数据库|redis|mq|端口|环境|host|用户名|密码)/i.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 180)).filter(Boolean);
      const envHints = uniq((pool.match(/(生产环境|测试环境|预发环境|灰度环境|测试|生产|预发|灰度|uat|staging|test|prod)/gi) || [])).slice(0, 8);
      const services = [];
      const SKIP_SERVICE = ['当前版本', '最新版本', '历史版本', '当前', '最新', '历史'];
      for (const c of cfs) {
        if (/程序名称|服务|版本|缺陷定位|模块/i.test(c.n)) {
          for (const line of String(c.v).split(/\n/)) {
            const s = line.trim();
            if (s && !SKIP_SERVICE.includes(s)) services.push(s.slice(0, 160));
          }
        }
      }

      return {
        id: t._id,
        uid: t.uniqueId != null ? t.uniqueId : null,
        t: cleanText(t.content, 400),
        note: cleanText(t.note, 1600),
        st: st ? st.name : null,
        sd: t.isDone === true,
        pr: t.priority != null ? t.priority : 0,
        cfg: cfg ? cfg.name : null,
        exId: t._executorId || (ex && ex._id) || null,
        ex: ex ? ex.name : null,
        crId: t._creatorId || (cr && cr._id) || null,
        cr: cr ? cr.name : null,
        created: t.created || null,
        updated: t.updated || null,
        due: t.dueDate || null,
        doneAt: t.accomplished || null,
        layer: t.taskLayer != null ? t.taskLayer : 0,
        cf: cfs.slice(0, 14),
        env: {
          services: uniq(services).slice(0, 10),
          hosts: uniq(ips.concat(urls).concat(envLines)).slice(0, 12),
          hints: envHints,
        },
        repo: uniq(repos.concat(repoLines)).slice(0, 8),
      };
    });
    bugs.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    return { total, returned: rows.length, warnings, bugs };
  })();
}

/* ------------------------- 采集主流程 ------------------------- */

const PROBE_SESSION = "(async () => { const r = await fetch('/api/users/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); return r.status; })()";

async function probeSession(cdp, sessionId) {
  let lastError = null;
  for (let i = 0; i < 15; i++) {
    try {
      const status = await cdp.evaluate(sessionId, PROBE_SESSION, 10000);
      if (status === 200) return { ok: true };
      lastError = new Error('TB 会话探测返回 HTTP ' + status);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return { ok: false, error: lastError };
}

async function openCollectorTab(cdp) {
  // 优先复用浏览器里已经打开的 TB 标签页：不新建标签、不关闭用户的页面，
  // 减少对浏览器的打扰（新开/关闭标签也会让 Edge 弹出额外确认）。
  try {
    const targets = await cdp.send('Target.getTargets');
    const pages = targets.targetInfos.filter((t) => t.type === 'page' && (t.url || '').startsWith(TB_ORIGIN));
    for (const page of pages) {
      try {
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
        const probe = await probeSession(cdp, sessionId);
        if (probe.ok) return { sessionId, targetId: null, reused: true };
      } catch { /* 换下一个 */ }
    }
  } catch { /* 忽略，走新建 */ }

  // 实在没有可用的 TB 页时才新建一个后台标签，用完关闭。
  const created = await cdp.send('Target.createTarget', { url: TB_ORIGIN + '/', background: true });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  const probe = await probeSession(cdp, sessionId);
  if (probe.ok) return { sessionId, targetId: created.targetId, reused: false };
  try { await cdp.send('Target.closeTarget', { targetId: created.targetId }); } catch { /* ignore */ }
  throw new Error('无法建立 TB 会话：' + (probe.error ? probe.error.message : '未知错误'));
}

/* ---------------- 采集核心（CLI 与常驻转发共用） ---------------- */

function buildState(control, previousState, startedAt) {
  const intervalMinutes = Number(control.intervalMinutes) > 0 ? Number(control.intervalMinutes) : DEFAULT_INTERVAL_MIN;
  return {
    ok: false,
    skipped: false,
    reason: null,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    durationMs: null,
    selection: { projectId: control.projectId || null, personId: control.personId || null },
    projectName: control.projectName || null,
    personName: control.personName || null,
    lastPullAt: previousState.lastPullAt || null,
    lastControlAt: previousState.lastControlAt || null,
    nextDueAt: previousState.nextDueAt || null,
    counts: previousState.counts || null,
    warnings: [],
    error: null,
    updatedAt: new Date().toISOString(),
    intervalMinutes,
  };
}

function decideDue(control, previousState) {
  const intervalMinutes = Number(control.intervalMinutes) > 0 ? Number(control.intervalMinutes) : DEFAULT_INTERVAL_MIN;
  const lastPull = previousState.lastPullAt ? new Date(previousState.lastPullAt).getTime() : 0;
  const dueByTime = !lastPull || Date.now() - lastPull >= intervalMinutes * 60 * 1000;
  const dueByControl = control.updatedAt !== previousState.lastControlAt;
  const selectedChanged = control.projectId !== (previousState.selection && previousState.selection.projectId)
    || control.personId !== (previousState.selection && previousState.selection.personId);
  return { due: dueByTime || dueByControl || selectedChanged, lastPull, intervalMinutes };
}

// 在已授权的 CDP 会话里完成一次采集：项目缓存 → 成员缓存 → 选中人的缺陷。
// 复用同一条连接时不会触发新的 Edge 授权确认。
async function collectOnce(cdp, sessionId, control) {
  const out = { projectsRefreshed: false, membersRefreshed: false, payload: null, skipped: false, reason: null };

  let projects = readJson(PROJECTS_FILE, null);
  const projectsStale = !projects || !projects.updatedAt || Date.now() - new Date(projects.updatedAt).getTime() > PROJECTS_TTL_MS;
  if (projectsStale || !Array.isArray(projects.projects) || !projects.projects.length) {
    projects = await cdp.evaluate(sessionId, '(' + tbFetchProjects.toString() + ')()', 60000);
    atomicWrite(PROJECTS_FILE, JSON.stringify(projects));
    log('projects refreshed count=' + projects.projects.length);
    out.projectsRefreshed = true;
  }
  if (!control.projectId) { out.skipped = true; out.reason = 'projects-only'; return out; }

  const membersFile = path.join(MEMBERS_DIR, control.projectId + '.json');
  let membersCache = readJson(membersFile, null);
  const membersStale = !membersCache || control.projectId !== membersCache.projectId || Date.now() - new Date(membersCache.updatedAt).getTime() > MEMBERS_TTL_MS;
  if (membersStale) {
    const members = await cdp.evaluate(sessionId, '(' + tbFetchMembers.toString() + ')(' + JSON.stringify(control.projectId) + ')', 60000);
    membersCache = { updatedAt: stamp(), projectId: control.projectId, members };
    atomicWrite(membersFile, JSON.stringify(membersCache));
    log('members refreshed project=' + control.projectId + ' count=' + members.length);
    out.membersRefreshed = true;
  }
  if (!control.personId) { out.skipped = true; out.reason = 'members-only'; return out; }

  const fieldDefsUrl = '/api/projects/' + control.projectId + '/scenariofields/search?pageSize=300';
  const fetched = await cdp.evaluate(
    sessionId,
    '(' + tbFetchBugs.toString() + ')(' + JSON.stringify(control.projectId) + ', ' + JSON.stringify(control.personId) + ', ' + JSON.stringify(fieldDefsUrl) + ')',
    180000,
  );
  const bugFile = path.join(BUGS_DIR, control.projectId + '__' + control.personId + '.json');
  const payload = {
    updatedAt: stamp(),
    projectId: control.projectId,
    projectName: control.projectName || null,
    personId: control.personId,
    personName: control.personName || null,
    total: fetched.total,
    returned: fetched.returned,
    warnings: fetched.warnings,
    bugs: fetched.bugs,
  };
  atomicWrite(bugFile, JSON.stringify(payload));
  log('pulled project=' + control.projectId + ' person=' + control.personId + ' bugs=' + fetched.bugs.length + ' total=' + fetched.total);
  out.payload = payload;
  return out;
}

/* ---------------- CLI：一次性采集（授权一次，采完退出） ---------------- */

async function cli() {
  const startedAt = Date.now();
  const previousState = readJson(STATE_FILE, {});
  const control = readJson(CONTROL_FILE, { enabled: false });
  const baseState = buildState(control, previousState, startedAt);

  if (control.enabled !== true) {
    log('skip reason=off');
    writeState({ ...baseState, ok: true, skipped: true, reason: 'off', finishedAt: stamp(), durationMs: Date.now() - startedAt });
    mark(true);
    return;
  }
  if (!acquireLock()) {
    log('skip reason=locked');
    mark(false);
    return;
  }

  let cdp = null;
  let collectorTargetId = null;
  try {
    cdp = await connect();
    const tab = await openCollectorTab(cdp);
    collectorTargetId = tab.targetId;

    const dueInfo = decideDue(control, previousState);
    if (!dueInfo.due) {
      baseState.ok = true;
      baseState.skipped = true;
      baseState.reason = 'not-due';
      baseState.nextDueAt = new Date(dueInfo.lastPull + dueInfo.intervalMinutes * 60 * 1000).toISOString();
      log('skip reason=not-due');
      return;
    }

    const result = await collectOnce(cdp, tab.sessionId, control);
    if (result.skipped) {
      baseState.ok = true;
      baseState.skipped = true;
      baseState.reason = result.reason;
      log('skip reason=' + result.reason);
      return;
    }
    const payload = result.payload;
    baseState.ok = true;
    baseState.lastPullAt = payload.updatedAt;
    baseState.lastControlAt = control.updatedAt || null;
    baseState.nextDueAt = new Date(new Date(payload.updatedAt).getTime() + dueInfo.intervalMinutes * 60 * 1000).toISOString();
    baseState.counts = { bugs: payload.bugs.length, total: payload.total };
    baseState.warnings = payload.warnings;
  } catch (error) {
    baseState.error = error.message || String(error);
    log('error ' + baseState.error.replace(/\s+/g, ' ').slice(0, 200));
  } finally {
    if (cdp && collectorTargetId) {
      try { await cdp.send('Target.closeTarget', { targetId: collectorTargetId }); } catch { /* ignore */ }
    }
    releaseLock();
    baseState.updatedAt = stamp();
    baseState.finishedAt = stamp();
    baseState.durationMs = Date.now() - startedAt;
    writeState(baseState);
    if (cdp) cdp.close();
    mark(baseState.ok);
  }
}

if (require.main === module) {
  cli().catch((error) => {
    releaseLock();
    writeState({
      ok: false,
      skipped: false,
      reason: null,
      selection: null,
      lastPullAt: readJson(STATE_FILE, {}).lastPullAt || null,
      error: String(error && error.message ? error.message : error),
      startedAt: stamp(),
      finishedAt: stamp(),
      updatedAt: stamp(),
    });
    log('fatal ' + String(error && error.message ? error.message : error));
    mark(false);
  });
}

module.exports = {
  collectOnce,
  openCollectorTab,
  probeSession,
  buildState,
  decideDue,
  writeState,
  readJson,
  atomicWrite,
  log,
  stamp,
  DEFAULT_INTERVAL_MIN,
  ROOT,
  DATA_DIR,
  CONTROL_FILE,
  STATE_FILE,
};