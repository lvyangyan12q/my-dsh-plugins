# 09: Agent 与 Skill 查看及关联管理

**What to build:** 用户查看真实角色、模型和权限，选择已有 Skill 分配给角色并在会话中生效。

**Blocked by:** 07 多角色及分科持续会话。

**Status:** code implemented; automated and installed native pre-step verification passed; live UI/completed-turn acceptance pending. Not fully accepted, PR ready, or release approved.

Evidence: [ticket09-management-evidence](../../../docs/ticket09-management-evidence.md). Agent-reported checks: 72 workbench tests, source/declaration/public-consumer checks, builds, archive checks and isolated installed native pre-step verification passed. Completed native composer turns, committed load history after restart, streaming/tools/approval/Stop, authenticated desktop/narrow Chrome and final paired 08/09 integration remain pending. Installed pre-step proposals do not establish completed turns or acceptance items below.

- [ ] 所属应用、来源及可用状态准确，不展示虚假演示列表。
- [ ] 配置持久保存并影响实际会话，不另造技能加载器。
- [ ] 内置角色不重复挤占全局列表，凭据不进入客户端持久状态。
