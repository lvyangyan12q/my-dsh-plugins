# Worktable 扩展接缝事实研究

日期：2026-10-18。仅源码研究，无构建、Host/浏览器启动、产品修改、提交或部署。本文为规划证据，不是实施授权或通过验收的接口规格。

## 样本与边界

本地仓库 `D:/programming/workspace/dsh-plugins/dsh-worktable` HEAD 为 `0a9ff9d34eb2475b427bdfabe4321f53e27f9a2d`。只读 Git rev-parse/status 已取得；没有设置全局 safe.directory。工作树存在大量已修改和未跟踪文件，包含 manifest、package、src、lib，以及未跟踪的 sessionCompat/widgetMount/hostTransport 等实现。因此下述结论描述的是本地工作树快照，不能等同于该提交或 GitHub main。manifest 与 package 均声明 0.4.0；package 仅声明兼容 DSH 0.1.1-rc.2、0.1.2-rc.1、0.2.0-rc.2，不能推导其他宿主版本可用。[manifest](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/dsh.plugin.json:1)、[package](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/package.json:1)

规划依据为本目录 [map](../map.md) 与 [框架草案](../framework-draft.md)。用户已确认一个前台、模块化平台内核、集中 DSH 适配、独立应用接入；项目组合多个应用、同实例多视图共享状态。这些是目标，不能当成 Worktable 现有实现。

## 已存在的可复用接缝

1. **第三方项目卡片接缝确实存在。** Worktable 在 `sidebar.footer.action` 注册自身，并声明 root 级子 slot `sidebar.worktable.project`；订阅其 entries，读取 options.id 形成目录。传给项目卡片的 ownerProps 包含 reportMeta、reportUsed、openSplit、activeSplitId、排序及隐藏信息。[注册与订阅](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:3211)、[子slot](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:3263)、[ownerProps](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:2052)
2. **布局声明入口存在。** openSplit 接受 LayoutSpec，使用项目视图覆盖并打开单例分栏，随后切换该项目绑定的原生会话。适合复用为项目卡片到工作环境的入口，但它不是应用注册、实例分配或权限授权。[openSplit](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:1626)
3. **既有内容类型可继续承载网页、文件和内置工具。** SplitContent 为 iframe、builtin、file；BuiltinType 是封闭联合。PaneTabBody 通过显式分支选择 BrowserPane、AnimPane、ConsolePane、ExplorerPane、GitPane、JobsPane、TerminalPane、CustomPane，没有发现可注册任意模块渲染器的统一入口。[类型](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:30)、[渲染](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:2815)
4. **原生会话适配已经集中了一部分。** apply 注入 sessions/conversation/workspaces，将当前会话快照镜像成 sessionId/cwd/jobs/subagents；可选 uiSession/uiConversation 用于状态与计时。window.__dsh* helper 是内部暴露，不应作为稳定第三方 SDK 契约。[会话作用域](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:954)、[apply](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:3162)、[可选服务](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:3226)
5. **生成产物归属可借鉴。** WidgetBinding 使用 projectId/paneId/bindingId/sessionId/folder/enabled，manifest 路径包含项目和稳定窗格身份；文件夹不是项目身份。它的存储仍为浏览器本地，不能直接替代应用实例或跨应用授权。[widgetMount](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/widgetMount.ts:3)

## 单例归属与多视图限制

- splitStore 是模块级单例，仅有一个 active/spec/root/viewArea；open 同一布局会关闭，不同布局先关旧布局再替换。dsh:split-claim 明确约定同一时刻一个分栏工作区，另有点击 `.ta_splitClose` 让位的兼容逻辑。[单例与互斥](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:733)
- SplitWorkspace 可以保活多个项目视图，但只有 activeId 对应的项目可见；池以 spec.id 为键，上限六个。这里的多项目保活不是多个独立分栏同时工作，更不是同应用实例共享业务状态。超过池容量后视图可能卸载，业务状态不能只靠组件内存保活。[保活池](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:3132)
- setSplitEnv 写入单个模块级环境；SplitScope 只有 sessionId/cwd。内置工具围绕当前原生会话工作，没有 projectId/appId/instanceId/viewId 四者的完整上下文。[SplitScope与环境](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:194)
- 项目 bindings 是 projectId→sessionId 单值。用户切到项目绑定以外的会话会自动关闭项目，插件自身导航通过标记例外。目标中的多应用多角色不能直接继续以“当前全局会话”识别应用实例。[项目状态](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:112)、[会话联动](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:976)
- 项目/布局/绑定/文件夹主要位于 localStorage 的 projects.v1，几何尺寸按 layoutId 写入 split.v2。未证明跨浏览器多窗口并发写入或 Host 级恢复；本轮没有运行这类验收。[加载](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/index.tsx:371)、[尺寸持久化](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:705)

## 宿主兼容依赖

分栏通过 `[data-phase]`、子元素结构和头部可见尺寸找原生会话根；修改 viewArea margin 与原生宽度变量，为覆盖层腾空间；使用 ResizeObserver 与 body MutationObserver 重新锚定，并检测外部 margin 改动后让位。这是不修改原生源码的客户端 DOM 适配，但仍依赖宿主页面结构，不是宿主稳定布局协议。[锚点](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:661)、[观察器](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:864)、[重锚与恢复](D:/programming/workspace/dsh-plugins/dsh-worktable/01_content/src/client/split.tsx:899)

因此应保留一个布局所有者，把此 DOM 逻辑集中封装在 DSH 适配层，避免每个业务应用自行观察/修改原生 DOM。本文未做兼容安全全审计，也未证明当前正式宿主完整可用。

## 仍需新建或明确的协议

下列为由目标推导的工程缺口，不是已有接口：

- 应用定义注册（ID、版本、入口、所需能力）与项目关联，区别现有卡片元信息。
- 稳定 appId/instanceId/viewId 身份、视图挂载/隐藏/释放通知；窗格移动不能更改实例。
- 同实例状态服务、视图卸载后的恢复，以及多浏览器写入冲突策略。
- 数据适配、读写能力与显式共享授权；业务资料不归窗格所有。
- 按实例/角色绑定原生会话，而非默认跟随全局当前会话；关闭视图不停止任务。
- 可扩展模块渲染注册及注销、协议版本与缺能力反馈；网页若需要平台能力，还需单独定义受控桥接，不应直接暴露 window helper。
- Host 持久化与浏览器布局偏好的边界、升级/卸载的数据保留及回退方式。

## MVP 必须验证

1. 不变更 DSH 原生源码的目标宿主上，项目开关、空会话/已有会话、切换会话、头部变化、窗口缩放均正确恢复原生布局。
2. 一个项目同时放入独立网页与深度数据/角色视图；不同应用互不占用彼此身份和状态。
3. 同实例两个窗格共享筛选/记录，移动标签、隐藏、关闭、池淘汰、重新打开、刷新后状态符合声明；新实例默认隔离。
4. 两项目共用应用定义时会话与工作状态隔离；资料仅在显式共享后可访问，不能因使用相同目录就认定同实例。
5. 隐藏/关闭视图不误停原生任务；角色切换/审批/Stop/旧轨迹仍准确关联对应会话。
6. 迟到生成结果不能写到替换后的模块；项目切换、模块删除及会话更换后归属校验有效。
7. 不兼容、缺依赖、存储失败、升级失败/回退、停用/卸载的数据保留有真实用户路径反馈。

这些验证尚未执行，不以源码函数存在推导验收通过。

## 基线冻结前的来源风险

当前 HEAD 与大量 dirty/未跟踪代码共同组成可读实现，不能直接选择 HEAD 就假定保留全部能力，也不能把整个工作树默认为可发布上游。冻结实施基线前需要只读清点差异、确认用户改动与来源、保留许可证及本地修复，再决定派生快照；本轮没有丢弃、覆盖、提交或推送这些文件。以上清点不替代用户关于派生方式和首版范围的决策。
