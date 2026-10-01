# 03: 工作台侧边栏入口与应用窗口

**What to build:** 用户安装独立工作台插件后，可以从 DSH 侧边栏打开注册应用，管理其窗口并恢复布局。

**Blocked by:** 02 的代码与公开接口验证；真实页面验收改为最终发布前的必要条件。

Implementation order update: after the user asked to continue following the proposed code-first sequence, proceed with implementation and automated tests without claiming live acceptance. Ticket 02 remains runtime-unaccepted. No final release or ready-for-review status before full session/UI acceptance.

**Status:** code implemented; automated checks passed; live acceptance pending. Not runtime accepted, ready-for-review, or release approved.

- [x] 应用注册、清理和重复标识有明确行为，无隐式模型调用（自动化验证）。
- [x] 重复打开聚焦同一实例，支持最小化、最大化、关闭和恢复（自动化验证）。
- [ ] 刷新恢复布局，小屏幕和键盘操作可用。
- [x] 标准插件安装、卸载和生命周期测试通过（官方包安装/Host import/启停及真实 Cordis 生命周期；安装后浏览器 UI 仍待验收）。

UI layout restoration, narrow viewport constraints, focus, keyboard navigation, and retained exercise/draft state pass automated tests. The unchecked UI item still requires real desktop/narrow screenshots and registered application workflows. Ticket 02 remains runtime-unaccepted; no Chrome actions or live acceptance are claimed by this change.

Stable type entry: `@deepseek-ai/dsh-personal-workbench/client`; source `plugins/personal-workbench/src/workbench-api.ts`. Service `ctx.personalWorkbench`: `registerApp`, `openApp`, `openWorkspace`. App view slot: `personal-workbench.app`, keyed by app ID with root scope. Tickets 04/05 may implement against this API before the common release gate. See `docs/workbench-api.md` and `docs/workbench-ticket03.md`.
