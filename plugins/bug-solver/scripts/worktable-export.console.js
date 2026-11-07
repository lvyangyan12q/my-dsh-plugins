/*
把工作台状态导出到 bug-solver 项目目录（一次性，只读浏览器内存 + 写项目文件夹）。

用法：
  1) 在打开工作台的那个浏览器里按 F12 → Console；
  2) 打开 scripts/worktable-export.console.js，整段复制粘贴进 Console，回车；
  3) 它会把布局/窗口状态写成
     F:\ai-project\my-dsh-plugins\plugins\bug-solver\.dsh-worktable\workspace-backup-<时间>.json
     并把结构摘要打印在 Console 里（把摘要发我，我据此给下一步的改布局脚本）。

说明：
  * 只读取 localStorage 的三个 key，不修改任何浏览器数据；
  * 通过工作台自己的 /api/worktable/write 写文件（同源、已登录），不改别的文件。
*/
(async () => {
  const PROJECT_DIR = 'F:\\ai-project\\my-dsh-plugins\\plugins\\bug-solver';
  const KEYS = [
    'dsh.worktable.projects.v1',
    'dsh.worktable.view.v1',
    'dsh.worktable.mountedWidget.v2',
    'dsh.worktable.pendingMount.v2',
  ];

  const dump = {};
  for (const k of KEYS) {
    const raw = localStorage.getItem(k);
    if (raw == null) continue;
    try { dump[k] = JSON.parse(raw); } catch { dump[k] = raw; }
  }
  if (!Object.keys(dump).length) {
    console.error('没有读到任何 dsh.worktable.* 键。请确认这个页面就是工作台所在的 origin。');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${PROJECT_DIR}\\.dsh-worktable\\workspace-backup-${stamp}.json`;
  const payload = { savedAt: new Date().toISOString(), origin: location.origin, state: dump };

  try {
    const r = await fetch('/api/worktable/write', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: file, content: JSON.stringify(payload, null, 2) }),
    });
    console.log(r.ok ? '已保存：' : '保存失败，HTTP ' + r.status + '：', file);
  } catch (e) {
    console.error('写入失败：', e);
  }

  // —— 结构摘要（发给我就能定位到具体项目/窗口）——
  const p = dump['dsh.worktable.projects.v1'];
  if (p) {
    console.log('projects 顶层字段：', Object.keys(p));
    if (Array.isArray(p.layouts)) {
      console.log('layouts 数量：', p.layouts.length);
      p.layouts.forEach((l) => {
        const panes = [...(l.top || []), ...(l.main || [])].map((x) => `${x.id}:${x.title}`);
        console.log(`  - id=${l.id} title=${l.title} top=${(l.top || []).length} main=${(l.main || []).length} panes=[${panes.join(', ')}] keys=${Object.keys(l).join(',')}`);
      });
    }
    if (p.views) console.log('views keys：', Object.keys(p.views));
    if (p.bindings) console.log('bindings：', JSON.stringify(p.bindings));
    if (p.folders) console.log('folders：', JSON.stringify(p.folders));
    if (p.hidden) console.log('hidden：', JSON.stringify(p.hidden));
  } else {
    console.warn('没有 dsh.worktable.projects.v1；实际键：', Object.keys(dump));
  }
  const v = dump['dsh.worktable.view.v1'];
  if (v) console.log('view 结构：', JSON.stringify(v).slice(0, 800));
  console.log('完成。把上面这些摘要贴给对话即可。');
})();
