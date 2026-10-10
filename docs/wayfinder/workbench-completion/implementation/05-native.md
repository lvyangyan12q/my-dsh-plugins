---
id: workbench-completion-native
title: DSH 原生执行闭环
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-roles]
---

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
