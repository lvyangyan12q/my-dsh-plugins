---
id: worktable-framework-04
title: 深度应用接入与同实例多视图
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-03]
---

# 04: 深度应用接入与同实例多视图

**What to build:** 一个真实深度应用能提供完整页面和可嵌入模块，通过统一注册进入已有项目；无需加载旧工作台前台。

**Blocked by:** [网页应用与未归属实例接入](03-web-entry.md)。

**Status:** ready-for-agent

- [ ] 一个真实深度应用能提供完整页面和可嵌入模块，通过统一注册进入已有项目；无需加载旧工作台前台。
- [ ] 同实例两个视图共享已声明的工作状态；移动标签、改变窗格或重复打开不新建实例和会话。
- [ ] 跨项目及显式新建实例拥有独立状态，实例上下文不由当前全局会话、目录或窗格序号推导。
- [ ] 视图关闭、池淘汰和重新挂载不删除实例状态；已有实例可恢复，所有订阅有明确释放行为。
- [ ] 保持单一布局所有者；同会话编辑器归属明确，不能通过重复Session规避冲突。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
