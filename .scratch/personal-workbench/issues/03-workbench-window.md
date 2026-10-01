# 03: 工作台侧边栏入口与应用窗口

**What to build:** 用户安装独立工作台插件后，可以从 DSH 侧边栏打开注册应用，管理其窗口并恢复布局。

**Blocked by:** 02 的代码与公开接口验证；真实页面验收改为最终发布前的必要条件。

Implementation order update: after the user asked to continue following the proposed code-first sequence, proceed with implementation and automated tests without claiming live acceptance. Ticket 02 remains runtime-unaccepted. No final release or ready-for-review status before full session/UI acceptance.

**Status:** in-progress; live acceptance pending

- [ ] 应用注册、清理和重复标识有明确行为，无隐式模型调用。
- [ ] 重复打开聚焦同一实例，支持最小化、最大化、关闭和恢复。
- [ ] 刷新恢复布局，小屏幕和键盘操作可用。
- [ ] 标准插件安装、卸载和生命周期测试通过。
