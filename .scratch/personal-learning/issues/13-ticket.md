# 13: 安装包完整验收

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 实际安装包独立菜单验证真实教学、隔离、重启、键盘窄窗格，记录版本及证据。

**Blocked by:** 07 生成失败取消与重试；08 实验上下文追问补课；12 学习推荐与恢复

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-installed-native

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 实际安装包独立菜单验证真实教学、隔离、重启、键盘窄窗格，记录版本及证据。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

See plugins/personal-learning/INSTALLED-EVIDENCE.md and evidence/final-installed-receipt.json. Actual installed native teaching, course/map/feedback, Stop, retry draft, missing skill fault injection, instance switching, process restart, A/B restore, keyboard focus and narrow viewport verified. Earlier native checks scope50f203b; final install and continuation checks scope1d05fc0. Exact limits recorded; no claim of exhaustive accessibility or all generated HTML behavior.

