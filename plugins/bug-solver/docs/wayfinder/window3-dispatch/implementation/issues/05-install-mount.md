# IM05 安装与验收

Status: claimed
Depends on: IM02, IM03, IM04, IM06

## Scope

- 把 `bridge/` 安装到 web profile（`dsh plugin --profile web add file:...`），重启 `dsh web`（**必须先得到用户明确同意**）。
- 写 p3 清单 `.dsh-worktable/project-layout-…/pane-p3-binding-….json`，路径 `window3-dispatch.html`。
- 真实挂载窗口3；验证：确认页带出、方案批准、真实会话创建、turn/end 完成、审核只读、只读对话、Stop。
- 至少一次 dry-run；真实 run 用低风险 bug。
- 记录证据（截图/日志）；只有实际看到挂载才说「已挂载」。

## Acceptance

- 安装成功；窗口3 渲染；一次真实 run 走完 scheme；服务器无写操作；凭据不出现。

## Progress

- 插件已安装到 web profile：`dependencies` 与 `dsh.profile.bundles` 均含 `bug-solver-dispatch`；`node_modules/bug-solver-dispatch/lib/index.js` 存在。
- p3 清单已写入 `.dsh-worktable/project-layout-30537acd-…/pane-p3-binding-5089e113-….json`，`path=window3-dispatch.html`、`kind=html`。
- 未重启 `dsh web`，因此插件未加载、窗口3 尚未实际挂载；等待用户同意重启后验收。
