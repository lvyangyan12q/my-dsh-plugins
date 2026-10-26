'use strict';
// Repository layout tool: the UI and this CLI share the same schema, lock and revision checks.
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');
const {writeFile} = require('node:fs/promises');

function options(args) {
  const flags = {}, positional = [];
  const values = new Set(['folder', 'top', 'main', 'title', 'ratio', 'project-id', 'expect-revision', 'legacy-file']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (name === 'json' || name === 'allow-remove') { flags[name] = true; continue; }
    if (!values.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('无效或缺少参数：' + arg);
    flags[name] = args[++i];
  }
  return {flags, positional};
}
function count(value, fallback, min) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > 100) throw new Error('窗格数量必须是 ' + min + ' 至 100 的整数');
  return number;
}
function newPane() { const id = 'pane-' + randomUUID(); return {id, title:'窗口', min:200, content:null}; }
function initialLayout(title, id) {
  if (!title || !title.trim()) throw new Error('首次创建请明确传入 --title 项目名称');
  id = id || 'layout-' + randomUUID();
  return {project:{id, name:title}, spec:{id, title, left:null, top:null, main:[], leftWidth:{default:260,min:160,max:1100},chatWidth:{default:360,min:240,max:600},topHeight:{default:200,min:120,max:700},chatSide:'right',chatFullHeight:false},geometry:{chatW:360,topH:200,leftW:260,paneWs:{},topWs:{},leftWs:{}}};
}
function resize(panes, target, allowRemove) {
  const removed = panes.slice(target);
  if (!allowRemove && removed.some(pane => pane.content || pane.tabs?.length)) throw new Error('缩减将移除已有内容；请保留窗格，或确认后加 --allow-remove（保存前会备份）');
  return [...panes.slice(0,target), ...Array.from({length:Math.max(0,target-panes.length)},newPane)];
}
function updateLayout(layout, flags) {
  const spec = layout.spec;
  if (flags['project-id'] !== undefined && flags['project-id'] !== layout.project.id) throw new Error('已有布局的项目身份不可更改');
  spec.top = resize(spec.top || [], count(flags.top, spec.top?.length ?? 0, 0), flags['allow-remove']);
  if (!spec.top.length) spec.top = null;
  spec.main = resize(spec.main, count(flags.main, spec.main.length || 1, 1), flags['allow-remove']);
  for (const [key, panes] of [['paneWs',spec.main], ['topWs',spec.top || []]]) layout.geometry[key] = Object.fromEntries(panes.map(pane=>[pane.id,layout.geometry[key][pane.id] ?? pane.min]));
  if (flags.title !== undefined) {layout.project.name = flags.title;spec.title = flags.title;}
  if (flags.ratio !== undefined) {
    const ratio = Number(flags.ratio);
    if (!(ratio > 0.15 && ratio < 0.85)) throw new Error('--ratio 需要在 0.15 与 0.85 之间');
    const oldRatio = spec.topHeightRatio ?? 0.5;
    layout.geometry.topH = Math.round(layout.geometry.topH * ratio / oldRatio);
    spec.topHeightRatio = ratio;
  }
  return layout;
}
async function backup(folder, document) {
  const filename = 'layout-backup-' + new Date().toISOString().replace(/[:.]/g,'-') + '-' + randomUUID() + '.json';
  await writeFile(path.join(folder,'.dsh-worktable',filename),JSON.stringify(document,null,2),{encoding:'utf8',flag:'wx'});
  return filename;
}
function emit(result, json) {
  if (json) {console.log(JSON.stringify(result));return;}
  if (result.status === 'missing') {console.log('项目目录尚无布局文件');return;}
  if (!['ok','legacy'].includes(result.status)) {console.error(result.message || result.status);if(result.candidates)console.error(result.candidates.join('\n'));return;}
  const d = result.document;
  console.log(result.file || path.join(result.folder,'.dsh-worktable','layout.json'));
  console.log('项目：' + d.project.name + '；身份：' + d.project.id + '；修订：' + d.revision);
  const panes = [...(d.spec.left ? [d.spec.left,...(d.spec.leftMore || [])] : []),...(d.spec.top || []),...d.spec.main];
  for (const pane of panes) console.log(pane.id + '：' + pane.title + '；标签：' + (pane.tabs || []).map(tab=>tab.title).join(' | '));
  if(result.backup) console.log('备份：' + result.backup);
  if(result.status === 'legacy')console.log('旧布局候选，尚未迁移；使用 set 明确保存到固定主文件。');
}
async function main() {
  const {flags,positional} = options(process.argv.slice(2));
  const [command = 'help', paneId, paneTitle] = positional;
  if (!['show','set','rename-pane','backup'].includes(command)) {
    console.log('用法：node worktable-layout.cjs show|set|rename-pane|backup [--folder 项目目录] [--json]\n首次创建：set --title 项目名称 [--top 2 --main 1 --ratio 0.5]\n修改：set [--top N --main N --title 名称]；rename-pane <窗格ID> <标题>\n冲突保护：--expect-revision N；旧文件选择：--legacy-file 文件名；显式删除有内容的窗格：--allow-remove');
    if(command !== 'help') process.exitCode = 2;
    return;
  }
  const folder = flags.folder === undefined ? path.resolve(__dirname,'..') : path.resolve(flags.folder);
  const store = await import(pathToFileURL(path.resolve(__dirname,'../../worktable/01_content/src/layout/project-layout.mjs')).href);
  const current = await store.readProjectLayout(folder,{legacyFile:flags['legacy-file']});
  if (command === 'show') {emit(current,flags.json);if(!['ok','legacy','missing'].includes(current.status))process.exitCode=1;return;}
  if (!['ok','legacy','missing'].includes(current.status)) {emit(current,flags.json);process.exitCode=1;return;}
  if (command !== 'set' && current.status === 'missing') throw new Error('项目目录没有布局，请先用 set --title 创建');
  if (flags['expect-revision'] !== undefined) {
    const expected = Number(flags['expect-revision']);
    if (!Number.isSafeInteger(expected) || expected < 0 || expected !== (current.status === 'ok' ? current.document.revision : 0)) {
      emit({status:'conflict',message:'布局修订与 --expect-revision 不一致，未修改文件。'},flags.json);process.exitCode=1;return;
    }
  }
  if (command === 'backup') {emit({...current,backup:await backup(current.folder,current.document)},flags.json);return;}
  const layout = current.status === 'missing' ? initialLayout(flags.title,flags['project-id']) : structuredClone(current.document);
  if (command === 'set') updateLayout(layout,flags);
  else {
    if (!paneId || paneTitle === undefined) throw new Error('用法：rename-pane <窗格ID> <标题>');
    const panes = [...(layout.spec.left ? [layout.spec.left,...(layout.spec.leftMore || [])] : []),...(layout.spec.top || []),...layout.spec.main];
    const pane = panes.find(item=>item.id === paneId);
    if (!pane) throw new Error('没有找到窗格 ' + paneId);
    pane.title = paneTitle;
  }
  const savedBackup = current.status === 'missing' ? undefined : await backup(current.folder,current.document);
  const result = await store.saveProjectLayout(folder,layout,current.status === 'ok' ? current.document.revision : null);
  emit({...result,backup:savedBackup},flags.json);
  if(result.status !== 'ok')process.exitCode=1;
}
main().catch(error => {
  const result = {status:'error',message:error.message};
  if(process.argv.includes('--json'))console.log(JSON.stringify(result));else console.error(error.message);
  process.exitCode = 1;
});
