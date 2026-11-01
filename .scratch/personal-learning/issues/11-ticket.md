# 11: 练习与理解证据

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 保存回答反馈及课程版本关联，刷新可回看；不把浏览或单次答对判为长期掌握。

**Blocked by:** 06 真实交互课程生成

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-mixed-boundaries

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 保存回答反馈及课程版本关联，刷新可回看；不把浏览或单次答对判为长期掌握。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

真实回答、模型反馈、课程版本关联与重开通过；不据单次正确推断长期掌握。

[最终安装证据](../../../plugins/personal-learning/INSTALLED-EVIDENCE.md)。最终代码1d05fc0，20项自动化通过；实际模型与边界检查范围50f203b，最终安装和导航恢复范围1d05fc0。自动化覆盖不等于所有宿主路径实测。
