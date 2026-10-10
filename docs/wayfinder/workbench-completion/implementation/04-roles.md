---
id: workbench-completion-roles
title: 能力复用与角色绑定
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

# 04: 能力复用与角色绑定

**What to build:** 用户复用管理入口建立的 Agent、Skills，绑定应用角色并正确恢复独立会话及可编辑任务上下文。

**Blocked by:** None (can start immediately)。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 12、13、18、22、24；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 可复用能力只来自管理入口；应用私有老师、角色和 Skills 继续归应用；保留已授权 Agent 管理行为。
- [ ] 按应用、实例、角色、学科关联会话；跨页面复用、跨实例隔离、并发创建和重复打开不生成重复会话。
- [ ] 角色更换需显式确认且保留旧会话；取消不改变当前绑定；失效、归档、缺失和不可访问会话不得静默替换。
- [ ] 任务目标和上下文来源可见，发送前可编辑、移除及取消；不把普通展示变成自动发送。
- [ ] Skills 发现、分配、缺失依赖和实际原生预设关系明确；发现/分配不冒充执行。
- [ ] 浏览器与 Host 重启保留绑定、身份和任务准备状态；实际完成历史和权限错误在原生执行工单验收。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
