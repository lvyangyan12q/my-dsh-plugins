# IM02 窗口3 正式页

Status: resolved
Depends on: —

## Scope

新建 `window3-dispatch.html`（单文件，dshell 皮肤）：

- B 轮次时间线：run 摘要、第 N 轮方案 → 实现 → 审核；方案批准/退回；`needs_attention`；Stop；通过；去复盘。
- `任务 / 对话（只读）` 页签；对话分分析修复/审核，分页、运行中刷新；无输入/发送/审批。
- API 适配层：`/api/bug-solver/start|runs|run|approve-plan|plan-feedback|stop|approve|messages`；桥不可用时显示明确降级（示例数据 + “桥未安装”），不假装已派发。
- 轮询：活跃 1.5s，空闲 10s；空/错/加载状态。
- 参考 `prototype-window3-ui.html` 的 B 变体，但正式实现，不复制原型噪声。
- jsdom 冒烟脚本（可复用 jsdom 路径）覆盖主要状态和只读对话。

## Acceptance

- `node scripts/smoke-window3-page.cjs` 或等价冒烟全绿。
- 页面可直接打开；桥不可用时降级明确。
- 提交到 `im02-window3-page`，merge 集成分支后报告。

## Result

已合入 integration（commit `31ca6a0`）；`window3-dispatch.html` + `scripts/smoke-window3-page.cjs`；冒烟 31/31 passed。页面契约：GET runs / run?id / messages?role&cursor&limit；POST start / approve-plan / plan-feedback / stop / approve；404/非 JSON = 桥未安装降级。
