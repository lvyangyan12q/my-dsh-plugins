# 07: 多角色及分科持续会话

**What to build:** 班主任、任课老师和辅导员拥有独立持续对话，任课老师按科目隔离。

**Blocked by:** 06 固定老师与图文课堂。

**Status:** code implemented; automated verification passed; installed runtime/UI acceptance pending. Not runtime accepted, PR ready, or release approved.

Evidence: [ticket07-roles-evidence](../../../docs/ticket07-roles-evidence.md). Agent-reported checks: 108 passed (65 workbench, 43 Kaogong). Production creation awaits the public Session persistence barrier before marking an exact-ID binding ready. Fresh paired tarball activation and crash/restart recovery, actual-turn Skill injection, native streaming/tools/approval/Stop, per-role composer drafts and authenticated desktop/narrow Chrome remain pending. Preserve the official `autoInstallPeers: false` policy. Automated checks and the parent's temporary flush prototype do not complete the acceptance items below.

- [ ] 角色及科目关联不会串话，并发打开不会创建重复会话。
- [ ] 切换保留草稿，关闭窗口不停止后台任务。
- [ ] 状态显示真实运行、待授权、失败和未读消息。
