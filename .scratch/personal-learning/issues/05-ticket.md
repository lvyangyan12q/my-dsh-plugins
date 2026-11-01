# 05: 固定交互样课

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 隔离打开条件概率样课，调整参数、切换范围与重置；键盘及窄窗格可操作。

**Blocked by:** 01 独立菜单与学习空间

**Status:** in-progress

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** pending-native-browser

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [ ] 隔离打开条件概率样课，调整参数、切换范围与重置；键盘及窄窗格可操作。
- [ ] 经公开用户行为入口验证本票；记录真实与替身边界。
- [ ] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [ ] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

实现已集成；公开应用边界及真实宿主声明测试通过。已完成隔离官方安装、认证 HTTP 创建与进程重启持久化验证。真实模型生成、原生 Stop/审批及浏览器窄窗格尚未验收，不关闭本票。

