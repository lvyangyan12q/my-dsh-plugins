# 09: 地图与课程导航

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 标注示例地图，区分关系类型，节点进入课程并返回保持选中。

**Blocked by:** 05 固定交互样课

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-mixed-boundaries

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 标注示例地图，区分关系类型，节点进入课程并返回保持选中。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

示例节点、课程跳转及返回选择由公开 UI 自动化验证；真实 B 地图与 A 导航通过。

[最终安装证据](../../../plugins/personal-learning/INSTALLED-EVIDENCE.md)。最终代码1d05fc0，20项自动化通过；实际模型与边界检查范围50f203b，最终安装和导航恢复范围1d05fc0。自动化覆盖不等于所有宿主路径实测。
