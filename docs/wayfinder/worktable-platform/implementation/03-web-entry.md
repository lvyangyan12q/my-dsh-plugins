---
id: worktable-framework-03
title: 网页应用与未归属实例接入
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-01, worktable-framework-02]
---

# 03: 网页应用与未归属实例接入

**What to build:** 通过公开注册接入一个真实网页应用，可独立打开并明确标记未归属实例。

**Blocked by:** [保护本地改动并验证派生基线](01-baseline.md)、[确认项目、应用与实例的关键交互原型](02-prototype.md)。

**Status:** ready-for-agent

- [ ] 通过公开注册接入一个真实网页应用，可独立打开并明确标记未归属实例。
- [ ] 用户可关联到一个项目且保留实例身份，不移动资料、不重建会话；同实例不能同时归属多个项目。
- [ ] 同项目再次打开恢复最近实例，显式新建与增加视图区分；刷新和重新打开保留该条链的实例与入口关联。
- [ ] 跨域不可读、拒绝嵌入或链接失效有明确反馈，允许可行外部打开；不承诺普通网页内部状态同步。
- [ ] 普通网页不取得原生工具、凭据、文件和其他实例访问权限；缺失注册及版本不兼容不静默换应用。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
