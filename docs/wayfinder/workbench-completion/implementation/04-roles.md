---
id: workbench-completion-roles
title: 能力复用与角色绑定
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: codex-completion-roles
blocked_by: []
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-11）

状态：open；已有无原生补丁平台实页部分证据，以下完整标准仍需逐项验收。

仅管理入口创建的Agent/Skill进入可复用公共目录；应用私有角色与能力保持应用归属。角色绑定通过已有公开能力完成，不扩展原生角色服务；保留已有Agent管理改动。

历史检查保留为旧环境证据，不作为当前基线通过。下列原始范围及验收项继续保留；涉及新增原生接口的实施方式以本节为准。


# 04: 能力复用与角色绑定

**What to build:** 用户复用管理入口建立的 Agent、Skills，绑定应用角色并正确恢复独立会话及可编辑任务上下文。

**Blocked by:** None (can start immediately)。

**Status:** claimed


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

## 2026-10-10 partial installed checkpoint

Official installed archive at `2d06641c802475b807130f5f100e0b6ebbfbb7c3` preserves a publicly prepared, user-edited ordinary task and context after browser refresh and Host cold restart. Reopening the application displays the exact fields; role creation remains available and no send occurred. Public discard removes the task editor and owned cache. [Actual browser receipt](../../../evidence/2026-10-10/completion-task-recovery-browser.json). Cross-instance, callback recovery, binding/history/permission and remaining full ticket criteria remain open.


## 2026-10-11 平台实页增量（分版本，不关单）

alpha 产品2d212ab：管理入口逐项关闭 Agent 和 Skill 的 userInvocable，应用公开 Retry 明确显示对应缺失能力，旧绑定/历史保留；恢复后同角色可用，不删除能力或直接编辑存储。跨页面复用同一角色会话；新建角色会话的原生确认取消保留当前会话/草稿，确认生成新会话，应用内历史查看保留旧会话与未发送文字。此处是 Session 替换，不能计作管理 Agent 更换。

源码1ab23ed：现有应用私有角色通过同应用/角色/preset、无学科公开投影保留，不加入公共复用列表；不可用、跨应用/角色/学科及公共 Agent 停用回归15/15。安装后的实际下一版编辑与保存已通过；另在专用跨页应用通过管理Agent选择→保存/预览/启用，旧Session保留并显示Agent已更换提示，新建会话确认取消保持旧绑定，确认后创建新预设会话并保留所有旧历史。并发、跨实例及未覆盖任务标准仍 open。[分版本实页证据](evidence/2026-10-11-unpatched-live.md#2026-10-11-平台收尾增量汇总)。
