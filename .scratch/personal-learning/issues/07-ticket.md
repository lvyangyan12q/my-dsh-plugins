# 07: 生成失败取消与重试

**Parent:** [DSH 个人学习插件规格](../../../docs/wayfinder/personal-learning/spec.md)

**What to build:** 真实任务状态，失败取消保留原课，重试去重，旧证据关联原版本。

**Blocked by:** 06 真实交互课程生成

**Status:** in-progress

**Triage:** ready-for-agent

**Implementation:** implemented

**Acceptance:** pending-native-browser

**Confirmed:** DSH 独立菜单，工作台非必需；A 工作室主界面、B 地图导航、C 不纳入首版。真实 DSH 用户流程为主验收边界。

- [ ] 真实任务状态，失败取消保留原课，重试去重，旧证据关联原版本。
- [ ] 经公开用户行为入口验证本票；记录真实与替身边界。
- [ ] 实例归属正确，刷新恢复适用数据；不影响其他应用。
- [ ] 相关失败状态可理解；演示数据不冒充真实生成。

## Evidence

实现已集成；公开应用边界及真实宿主声明测试通过。已完成隔离官方安装、认证 HTTP 创建与进程重启持久化验证。真实模型生成、原生 Stop/审批及浏览器窄窗格尚未验收，不关闭本票。

