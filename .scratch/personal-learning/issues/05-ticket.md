# 05: 固定交互样课

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 隔离打开条件概率样课，调整参数、切换范围与重置；键盘及窄窗格可操作。

**Blocked by:** 01 独立菜单与学习空间

**Status:** complete

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** verified-mixed-boundaries

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [x] 隔离打开条件概率样课，调整参数、切换范围与重置；键盘及窄窗格可操作。
- [x] 经公开用户行为入口验证本票；记录真实与替身边界。
- [x] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [x] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

真实条件概率课程及自动化样课验证 N100/B40/交集30 得到30%与75%；重置及范围切换由自动化验证。

[最终安装证据](../../../plugins/personal-learning/INSTALLED-EVIDENCE.md)。最终代码1d05fc0，20项自动化通过；实际模型与边界检查范围50f203b，最终安装和导航恢复范围1d05fc0。自动化覆盖不等于所有宿主路径实测。
