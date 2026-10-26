---
id: worktable-layout-custom-validation
parent: worktable-project-layout-spec
title: 自定义窗口身份与会话创建前校验
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

编号共用规则已在 rc.3.4 修复，正式 rc.3.3 仍复现 leftMore 错绑。本票补齐创建分组/会话前的无副作用预校验、发送前稳定身份复验、在途提交去重、草稿保留及可读错误。不要移除 begin 的缺失/重复 ID 守卫。

通过实际自定义提交公开入口验证：无效窗格/目录/项目创建与发送均为0；有效 p2/p3 分别绑定正确窗格；等待中重排或切换不误绑；双击不重复创建/发送；真实已创建但后续失败时如实反馈且不自动删除会话。

## Resolution

根因和现有顺序已独立复现确认；新增前置校验和文案尚未实现。
