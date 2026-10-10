---
id: workbench-completion-reading
title: 阅读统计通用应用闭环
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-data, workbench-completion-roles, workbench-completion-native]
---

# 09: 阅读统计通用应用闭环

**What to build:** 用户用工作台搭建并持续使用阅读统计，证明平台能服务考公以外的应用。

**Blocked by:** 3 · 数据展示与模块联动；4 · 能力复用与角色绑定；5 · DSH 原生执行闭环。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 25；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 自有真实数据驱动统计、列表、筛选、详情，展示无隐式模型调用；多实例互不覆盖。
- [ ] 配置、预览、启用、修改、停用与恢复不丢数据；浏览器/Host 重启可继续使用。
- [ ] 显式模块任务交给正确角色，经原生会话得到完成结果，并能查看历史。
- [ ] 公共模块与能力可复用，平台核心不新增阅读或考公业务条件判断。
- [ ] 实际安装桌面/窄屏完整用户流程通过，明确区分展示完成和 AI 任务完成。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
