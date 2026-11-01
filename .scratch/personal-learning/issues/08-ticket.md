# 08: 实验上下文追问补课

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 编辑当前课程、参数和疑问后发往原生会话，补充解释后返回课程。

**Blocked by:** 06 真实交互课程生成

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-installed-native

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 编辑当前课程、参数和疑问后发往原生会话，补充解释后返回课程。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

[最终安装证据](../../../plugins/personal-learning/INSTALLED-EVIDENCE.md) 的 Final-package follow-up and supported-parameter acceptance 记录最终包真实追问、原生补充解释、返回同课，以及进程重启后真实HTML参数100/40/29恢复。最终包6ebc97432f82e763fe9a61a441ade9f6c7fa9d310d52aad6a8ec1c6970fb8feb，代码1d05fc0；不以自动化替代此处实际宿主证据。

