'use strict';
// 校验 data/ 下的产物结构与数量（自测用）。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const problems = [];
const info = [];
function read(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch (e) { problems.push('无法读取 ' + file + '：' + e.message); return null; }
}
function need(cond, msg) { if (!cond) problems.push(msg); }

const control = read('control.json');
if (control) {
  need(typeof control.enabled === 'boolean', 'control.enabled 不是布尔值');
  if (control.enabled) {
    need(typeof control.projectId === 'string' && control.projectId, 'control.enabled=true 但缺少 projectId');
    need(typeof control.personId === 'string' && control.personId, 'control.enabled=true 但缺少 personId');
  }
  info.push('control: enabled=' + control.enabled + ' project=' + (control.projectName || '-') + ' person=' + (control.personName || '-'));
}

const projects = read('projects.json');
if (projects) {
  need(Array.isArray(projects.projects) && projects.projects.length > 0, 'projects.json 项目列表为空');
  need(projects.priorities && Object.keys(projects.priorities).length > 0, 'projects.json 缺少优先级映射');
  info.push('projects: ' + (projects.projects || []).length + ' 个，me=' + (projects.me && projects.me.name));
}

const state = read('state.json');
if (state) {
  need(typeof state.ok === 'boolean', 'state.ok 不是布尔值');
  info.push('state: ok=' + state.ok + ' skipped=' + state.skipped + ' reason=' + (state.reason || '-') + ' lastPullAt=' + (state.lastPullAt || '-') + ' error=' + (state.error || '-'));
  if (state.error) problems.push('state.error 非空：' + state.error);
}

if (control && control.projectId) {
  const members = read(path.join('members', control.projectId + '.json'));
  if (members) {
    need(members.projectId === control.projectId, 'members 文件的 projectId 不一致');
    need(Array.isArray(members.members) && members.members.length > 0, 'members 为空');
    info.push('members: ' + (members.members || []).length + ' 人');
  }
  if (control.personId) {
    const bugFile = path.join('bugs', control.projectId + '__' + control.personId + '.json');
    const bugs = read(bugFile);
    if (bugs) {
      need(bugs.projectId === control.projectId, 'bugs 文件 projectId 不一致');
      need(bugs.personId === control.personId, 'bugs 文件 personId 不一致');
      need(Array.isArray(bugs.bugs), 'bugs 不是数组');
      const open = bugs.bugs.filter((b) => !b.sd).length;
      info.push('bugs: ' + bugs.bugs.length + ' 条（未完成 ' + open + '），total=' + bugs.total);
      need(bugs.total === bugs.bugs.length, 'bugs 条数与 total 不一致（可能未取全）');
      for (const b of bugs.bugs.slice(0, 5)) {
        need(typeof b.id === 'string' && b.id.length > 0, 'bug 缺少 id');
        need(typeof b.t === 'string' && b.t.length > 0, 'bug 缺少标题');
        need(b.exId === control.personId, 'bug 负责人与选中人不一致：' + b.exId);
      }
    }
  }
}

console.log('--- verify-data ---');
for (const line of info) console.log('OK  ' + line);
for (const p of problems) console.log('ERR ' + p);
if (!problems.length) console.log('PASS');
process.exit(problems.length ? 1 : 0);
