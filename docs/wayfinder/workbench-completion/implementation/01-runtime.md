---
id: workbench-completion-runtime
title: 平台入口与窗口恢复
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: codex-completion-runtime
blocked_by: []
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-11）

状态：open；等待无原生补丁适配及对应验收。

清除sidebar.sections和retireTabsByKind依赖。用既有公开插件入口进入工作台；无法可靠注销的原生标签不注册。应用窗口、布局、刷新与重启恢复由插件持久化。验收原生导航、无关标签和草稿不变。

历史检查保留为旧环境证据，不作为当前基线通过。下列原始范围及验收项继续保留；涉及新增原生接口的实施方式以本节为准。


# 01: 平台入口与窗口恢复

**What to build:** 用户在原生菜单及兼容侧栏使用同一应用窗口，关闭、切换、刷新、重启和停用后能继续操作且无失效内容。

**Blocked by:** None (can start immediately)。

**Status:** claimed

**执行条件：** 先核实已认领侧栏公共接缝研究，实际清理通过前不能关闭。

**范围关系：** 补充规格 User Stories 1、2、3、4、5、15、31；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 原生工作区、会话导航、菜单和未发送草稿保留；同一应用实例重复打开只聚焦现有窗口。
- [ ] 最大化、最小化、恢复、关闭重开、页签和布局恢复在实际安装浏览器通过；桌面与窄屏无遮挡且焦点合理。
- [ ] 从全局插件管理停用 Better Sidebar 后，插件入口与自有窗口正确清理；只有已有公开接口支持可靠注销时才注册原生标签。热更新、重新启用无重复注册，其他标签和会话保留。
- [ ] 无可选插件、未知或不兼容依赖均保留主入口并显示明确原因；只用受支持公共接口。
- [ ] 浏览器刷新和 Host 冷启动后数据、应用状态及会话身份保持；不能把关闭当作停止 Agent。
- [ ] 针对实际缺陷给出失败再通过的外部回归；真实执行期间窗口恢复在原生执行工单继续验收。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。

## 2026-10-10 partial installed checkpoint

Official archive at `2d06641c802475b807130f5f100e0b6ebbfbb7c3` passed the adopted-session unload browser RED→GREEN: native Workbench tab 1→0, unrelated File tab and native session tree preserved. Re-enable and browser reload each restore exactly one catalog; isolated configuration restored byte-for-byte. Evidence: [browser receipt](../../../evidence/2026-10-10/completion-sidebar-retirement-browser.json). Full ticket remains open for the remaining window, compatibility, dormant-session and executing-Agent scope.


## 2026-10-11 用户确认：恢复原生、改为插件适配

原生菜单扩展：曾新增sidebar.sections插槽及SidebarRoot渲染、类型、测试/快照。后续工作台只使用目标DSH已有公开扩展位，不再要求修改原生菜单。没有对应插槽时选择现有公开入口并明确限制；不改原生布局、不操作内部存储。侧栏实例清理同样不得依赖新增retireTabsByKind；无公开持久清理能力时不注册无法安全卸载的原生标签，使用插件自有窗口或受支持入口。

本工单保持open。详细原生改动清单见[恢复与后续适配](../native-restoration.md)。考公专项暂缓，已有数据与历史证据保留。

## 2026-10-11 无补丁入口适配（代码层完成，实页验收待做）

已把主入口从补丁槽 `sidebar.sections` 迁到原生公开一级面板（模式同原生 `ui-schedule`/`ui-plugin-manager`）：

- 注册 `main`(keyed, key=`personal-workbench`) 与 `sidebar.panellist`(id=`personal-workbench`)。
- `openWorkspace`/`openApp` 经 `ctx.layout.selectPanel('personal-workbench')` 选中面板；`panel-navigation.bindWorkbenchPanel` 做 `visible↔activePanelId` 双向绑定。原生不持久化 `activePanelId`，故由插件把持久化的 `visible` 在启动时重新选回该面板。
- 移除 `retireTabsByKind` 硬依赖：Better Sidebar 仅走公开 `closeIn` 回退；能力缺失时明确降级。
- Agents/Skills 管理改为浮层覆盖在工作台面板之上，打开应用时关闭；不再因打开管理而卸载工作台。

**降级（用户 2026-10-11 确认）**：`main` keyed 面板在切换时卸载，离开工作台会卸载其应用视图，草稿须由应用自持持久状态。既有“保留草稿”测试已改为断言卸载。

**已验证**：工作台 `build`（tsdown+tsc 类型）通过；271 项工作台测试通过（含重写的 `workbench-lifecycle`/`workbench-ui`/`native-navigation`/`artifact`）。证据见[无补丁适配证据](evidence/01-patch-free-seams.md)。
**待验收**：在未补丁实例上用实际浏览器验收原生导航、无关标签与草稿保留、窗口模式、刷新、外部停用与热更新。
