---
id: workbench-completion-native
title: DSH 原生执行闭环
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-roles]
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-11）

状态：open；等待无原生补丁适配及对应验收。

取消conversation.session.chrome、composer-surfaces及原生编辑器补丁依赖。优先一个原生编辑面，通过已有公开入口打开/恢复同Session；无法完整嵌入时使用原生会话导航并明确入口。复验标题、对话/轨迹、工具、审批、提问、Stop、流式、草稿及历史身份。

历史检查保留为旧环境证据，不作为当前基线通过。下列原始范围及验收项继续保留；涉及新增原生接口的实施方式以本节为准。


# 05: DSH 原生执行闭环

**What to build:** 用户在应用内真正执行任务，并通过原生对话、轨迹、审批、提问和 Stop 控制任务及恢复历史。

**Blocked by:** 4 · 能力复用与角色绑定。

**Status:** ready-for-agent

**执行条件：** 用户授权的可用模型及原生执行环境；模型条件未满足时保持未验收，不阻塞无 AI 工单。

**范围关系：** 补充规格 User Stories 19、20、21、22、31；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 在用户授权的隔离环境确认可用模型，记录真实成功或授权错误；不复制正式密钥、不重复重试相同阻碍。
- [ ] 原生标题、对话、轨迹、输入、模型/推理设置、工具权限以及工具结果完整可操作。
- [ ] 实际发送并完成流式回答与工具任务，执行真实审批和提问以及 Stop；替身不能替代这些结果。
- [ ] 执行中收起/关闭/重开或跨页切换不误停 Agent；运行、等待授权、失败与新消息状态正确。
- [ ] 已完成消息和旧会话历史可查看，刷新/冷重启后保持应持续的任务状态与同一身份。
- [ ] 桌面/窄屏、键盘焦点和物理中文输入法验收通过；合成输入不能证明物理输入法。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。


## 2026-10-11 用户确认：恢复原生、改为插件适配

原生会话扩展：曾新增conversation.session.chrome工厂供嵌入标题栏使用；composer-surfaces及editor/root/keymap绑定解决同Session多个输入面竞争。后续只复用已有公开会话/轨迹/审批/Stop接口；优先单一原生编辑面，必要时通过公开导航打开原会话。不修改原生编辑器来适配插件，不要求新chrome工厂或内部服务。保持同Session、草稿、原生模型/权限操作；缺少公开嵌入能力时明确降级。

本工单保持open。详细原生改动清单见[恢复与后续适配](../native-restoration.md)。考公专项暂缓，已有数据与历史证据保留。

## 2026-10-11 无补丁会话适配（代码层完成，实页验收待做）

- 移除 `conversation.session.chrome` 依赖：`renderNativeSession` 只渲染原生公开的 `conversation.content` 会话体。
- **降级**：应用内嵌视图不再包含第二套原生标题/导航（原生 header 属主为主对话，插件不可二次声明）。需要完整标题栏与 Chat/Trajectory 导航时，用公开 `uiWorkspace.openSession` 打开同一原生会话。
- 保留单一原生编辑面；取消 `composer-surfaces` 同 Session 多输入面依赖。

**未满足项**：原生标题、lineage、actions 与 view-tabs 的内嵌渲染不可用，不得勾选为通过。真实模型、工具、审批、提问、Stop、流式关闭重开与历史恢复仍需在授权环境实页验收。

## 2026-10-11 单编辑面兼容修复

同角色的多个对话模块及跨页入口复用唯一角色会话位置；其它模块通过查看对话定位既有模块。原生会话体仅在应用角色视图 active 时挂载，隐藏页面或离开工作台释放编辑根，角色绑定、Session 和未发草稿由原生/平台持久服务保留，不调用 Stop。自定义生成模块遵守相同全应用角色宿主选择。模块 UI 回归覆盖重复及跨页入口；真实原生编辑器、草稿、审批和 Stop 待无补丁安装环境验收。本工单保持 open。

## 2026-10-11 无补丁原生空白会话归属修复

实页发现：应用已有角色 Session 可在嵌入区编辑未发送草稿，但公开导航打开同 ID 后原生显示“选择工作区”且输入失效。只读持久化核对：Session cwd 与既有原生 Workspace path 一致，而该 Workspace 的 sessionIds 未包含角色 Session。原生 blank Conversation 必须有工作区归属才启用 composer，故不是导航丢失 ID。角色创建在 header flush 后经公开 Workspace.attachSession 归属既有工作区；读取旧 ready 绑定同样修复缺失归属。缺失或改变工作区明确报错，不新建工作区、不替代 Session、不发送消息。公开 Host 回归须配合无补丁实页复验，工单保持 open。
