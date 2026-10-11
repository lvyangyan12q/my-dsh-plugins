# 无补丁适配证据（01/05/06 代码层）

2026-10-11。范围：工作台对未打补丁原生 DSH 的入口/会话/标注适配。本记录为**代码层证据**，不代替实际安装浏览器的实页验收。

## 原生基线

- 文档目标：`639ed015397290b3745d163aafe02ffee4aa3f84`（`dsh-0.2.0-rc.2`）。
- 实际检出：`d743267388641bc76f17c45ce8b4c231aed1d32c`（`dsh-v0.2.1-alpha.2`），工作树干净、无补丁。
- 两版本均**不含** `sidebar.sections`、`conversation.session.chrome`、`stageImages`、`retireTabsByKind`。

## 改动

- **01 入口**：删除 `sidebar.sections` 注册；新增 `main`(keyed, key=`personal-workbench`) 与 `sidebar.panellist`(id=`personal-workbench`)。`openWorkspace`/`openApp` 经 `ctx.layout.selectPanel` 选中面板；`bindWorkbenchPanel` 双向绑定 `visible↔activePanelId`（原生不持久化 `activePanelId`，由插件持久化的 `visible` 在启动时选回面板）。`WorkspaceLauncher`/`sidebar-coexistence-styles.ts` 删除；Agents/Skills 入口移入面板头部；管理浮层覆盖在工作台面板之上、打开应用时关闭。
- **05 会话**：`renderNativeSession` 只渲染公开 `conversation.content`；删除 `conversation.session.chrome` 使用。
- **06 标注**：`annotation-client.append` 只走公开草稿插入；删除 `stageImages`；携带截图时显式报“需手动附加”。

## 已知公开接口限制（不表示用户接受原需求减少）

- `main` keyed 面板切换即卸载：离开工作台会卸载应用视图，草稿由应用自持持久状态。
- 内嵌会话不显示第二套原生标题/导航；需完整标题栏时用 `uiWorkspace.openSession` 打开原会话。
- 截图不自动进入原生草稿；需在原生会话手动附加。

## 验证

- `pnpm run build`（tsdown 打包 + `tsc -p tsconfig.types.json` 类型检查）：通过。工作台现对未打补丁原生类型编译通过。
- 工作台测试：`npx tsx --test tests/*.test.ts tests/*.test.mjs` → 271 通过 / 0 失败（含重写的 `workbench-lifecycle`、`workbench-ui`、`native-navigation`、`artifact` 及 `role-factory`/`role-ui`/`annotation` 更新）。
- 重写理由：`main` keyed 面板只在激活时渲染（`ui-renderer/scoped-slots.tsx:1178`），fixture 已改为忠实建模“切走即卸载”。

## 未验证 / 待办

- 未补丁实例上的实际浏览器实页：原生导航、无关标签与草稿保留、窗口模式、刷新、外部停用、热更新；Host 冷启动恢复。
- 05 的真实模型、工具、审批、提问、Stop、流式关闭重开与历史恢复。
- 06 手动附加截图的实页路径。
- 历史首次适配失败：reading-statistics 陈旧 lib/externals、版本断言及kaogong测试依赖问题已后续修复；不作为当前阻碍。最新2d212ab在独立未补丁alpha上的三项完整门禁status0。上列实际流程逐项证据见2026-10-11-unpatched-live.md，仍不能按测试数关单。
