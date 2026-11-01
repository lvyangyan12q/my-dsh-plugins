# 02: 独立学习实例切换

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 创建和切换两个实例，状态隔离；新增视图不复制实例，关闭页面不丢数据。

**Blocked by:** 01 独立菜单与学习空间

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-mixed-boundaries

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 创建和切换两个实例，状态隔离；新增视图不复制实例，关闭页面不丢数据。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

真实 UI 创建独立实例，无前实例课程；切回恢复课程和回答。多视图共享规则由自动化验证。

[最终安装证据](../../../plugins/personal-learning/INSTALLED-EVIDENCE.md)。最终代码1d05fc0，20项自动化通过；实际模型与边界检查范围50f203b，最终安装和导航恢复范围1d05fc0。自动化覆盖不等于所有宿主路径实测。
