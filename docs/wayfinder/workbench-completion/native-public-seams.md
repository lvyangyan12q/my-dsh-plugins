# 原生公开接缝盘点（01/05/06）

2026-10-11。目的：列出未经工作台补丁的原生 DSH 实际公开的扩展接缝，判定每个被补丁新增的能力应由哪条公开接缝替代，或必须明确降级。本文是 01 入口适配、05 原生会话路径、06 标注图片的公共依据。

## 原生基线

- 仓库 `D:/programming/workspace/deepseek-harness`。文档记录的恢复目标为 `639ed015397290b3745d163aafe02ffee4aa3f84`（`dsh-0.2.0-rc.2`）。
- 实际 reflog 显示该仓库已 `pull --tags origin master` 前进到 `d743267388641bc76f17c45ce8b4c231aed1d32c`（`dsh-v0.2.1-alpha.2`，领先 935 个提交）。工作树干净，**未应用任何工作台补丁**。
- 在 `d743267388` 源码内检索 `sidebar.sections`、`conversation.session.chrome`、`stageImages`、`retireTabsByKind`/`retirementVersion`、`composer-surfaces` 均为 0 命中：新版本仍未原生提供这些符号，补丁依赖必须消除，不能靠升级原生自动解决。
- 结论：无补丁适配要求在 rc.2 与 0.2.1-alpha.2 上同样成立。基线版本差异（见文末风险）待用户确认。

## 补丁新增能力 → 公开替代或降级

| 能力 | 补丁新增符号 | 原生是否有公开替代 | 结论 |
|---|---|---|---|
| 工作台一级入口 | `sidebar.sections` | 有：`main`(keyed) 面板 + `sidebar.panellist`(list) 图标 | 改为公开一级面板入口 |
| 应用/管理窗锚定 | `shell.overlay`（本为公开） | 是，本就是公开 list 槽 | 保留 |
| 会话内嵌完整原生标题栏 | `conversation.session.chrome` | 无。原生 `conversation.session.header` 为 `single` 且被主对话占用，插件二次声明会触发槽归属校验失败 | 降级：单一原生编辑面，用公开导航打开原会话 |
| 同 Session 多输入面共享 | `composer-surfaces`（原生编辑器改动） | 无 | 降级：只保留一个原生编辑面 |
| 标注截图暂存为草稿附件 | `IConversation.stageImages` | 无 | 降级：插件内保存文字/坐标；图片走原生公开附件入口或用户显式附加 |
| 休眠侧栏页签持久注销 | `retireTabsByKind` | 无 | 降级：不注册无法安全卸载的原生标签；改用插件自有窗口（`shell.overlay`/`main`） |

## 原生实际公开的可用接缝（`d743267388` 核对）

侧栏列（`ui-sidebar`）：
- `sidebar.brand.mark` / `sidebar.brand.name`：single，root。
- `sidebar.workspaces`：single，root，**已被 ui-workspace 占用**。
- `sidebar.settings`：single，root，已被 ui-settings 占用。
- `sidebar.footer.action`：list，root，owner 只收 `{ wide }`，位于 Settings 旁。
- `sidebar.panellist`：list，root，每项以 `id`（品牌化为 `MainPanelId`）关联一个主面板，sidebar 渲染图标并按 `active` 高亮。

布局列（`ui-layout`）：
- `root`：内核内置 single。
- `sidebar`：single，root，已被 ui-sidebar 占用。
- `main`：**keyed，root**；保留键 `conversation`。其它键不绑定 Session。插件可注册自有键成为一级中央面板。
- `rightbar` 等：另有归属。
- `shell.overlay`：list，root，公开；工作台当前据此锚定中央列。

会话列（`ui-conversation`）：
- `conversation.content`：公开体工厂（可渲染对话体）。
- `conversation.session.header` / `...lineage` / `...actions` / `...utilities` / `...corner`：single，属主为主对话，插件不可二次声明。
- 原生导航 `uiWorkspace.openSession(sessionId)` / `startSession(...)`：公开，可用于打开/恢复同 Session。

**公开一级面板的现成范例**（原生自带插件，即 01 的目标模式）：
- `packages/client/ui-schedule/src/client/index.ts` 与 `.../ui-plugin-manager/src/client/index.ts`：
  - `ctx.slots.inject('main', …register({ name:'main', key:PANEL_ID, … }, Page))`
  - `ctx.slots.inject('sidebar.panellist', …register({ name:'sidebar.panellist', id:PANEL_ID, order, locale, label:()=>t('panel') }, Icon))`
  - 选择由 `ctx.layout.selectPanel(panelId)` 完成。

## 关键约束：`main` keyed 面板在切换时卸载

`ui-renderer` 的 `renderSlot` 对 keyed 槽只渲染 `entryKey` 命中的那一个条目
（`packages/client/ui-renderer/src/client/scoped-slots.tsx:1178-1184`），`AppFrame` 以
`renderSlot('main', {}, { entryKey: activePanelId ?? 'conversation' })` 调用
（`packages/client/ui-layout/src/client/AppFrame.tsx:40-42`）。因此把工作台内容直接放进
`main` keyed 面板，**用户切到原生会话/其它面板时该面板会卸载**。

这与工作台的硬性保留要求冲突：`Workbench` 服务须在离开工作台后保留应用窗口
（`tests/native-navigation.test.mjs:13`）且**应用组件与组件内草稿不卸载**
（`tests/workbench-ui.test.mjs` 断言 `closeWorkspace` 后同一草稿 DOM 节点仍在、
`counts().unmounts === 0`；README 亦声明 "closed workspace retain application components … with active:false"）。

结论：直接把工作台做成 `main` 面板会破坏草稿保留。需要在"一级面板入口"和"持续挂载窗口宿主"之间做组合，或改为不改架构的公开入口。此点见 01 工单决策。

## 逐工单处置

- **01 入口/窗口**：主入口从 `sidebar.sections` 迁到公开一级面板（`main` keyed + `sidebar.panellist`）。`openWorkspace()` 调用 `ctx.layout.selectPanel('personal-workbench')`；工作台成为中央面板而非浮层。移除 `retireTabsByKind` 依赖（该能力不存在），停用清理只处理插件自有注册。
- **05 会话**：不嵌入第二套原生标题栏。应用需要原生执行时，用 `uiWorkspace.openSession` 打开/聚焦原会话，保留单一编辑面、草稿、原生模型与权限；无法内嵌完整标题栏属**明确降级**，需在验收中标注未满足项。
- **06 标注**：图片不进原生草稿。标注保存位置与文字于插件；图片经原生公开附件入口或用户显式附加，不调用私有上传/草稿实现。

## 验收影响

- 01：`shell.overlay` 承载的应用窗与管理面板仍是浮层；改为 `main` 面板后键盘/焦点/多面板切换行为需重新验收（spec Testing Decision 4、8）。
- 05：完整原生标题栏、同 Session 多输入面属不可用项，不得勾选为通过；需在工单明确降级。
- 06：图片自动随标注进入草稿的能力不成立，需改为手动附加并记录。

## 风险 / 待确认

- 当前原生只读检出为 `d743267388`，跟踪文件无差异；`639ed015` 是历史恢复与独立rc.2验收版本。支持的两个精确候选分别构建/安装，不混用证据；正式3080实际运行仍需来源核验。
- 当前插件采用公开 `main` / `sidebar.panellist` 入口。内嵌完整标题栏、自动草稿截图及面板切换卸载是明确限制，不能把不改原生的指示解释为用户确认减少原始验收要求。
