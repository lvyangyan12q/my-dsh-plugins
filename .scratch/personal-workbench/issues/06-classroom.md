# 06: 固定老师与图文课堂

**What to build:** 学习者在考公窗口左侧查看讲义和题目，右侧与固定老师会话交流，老师知道当前课堂材料和目标。

**Blocked by:** 04 考公注册与默认实例接入。

**Status:** code implemented; automated verification passed; installed runtime/UI acceptance pending. Not runtime accepted, PR ready, or release approved.

Evidence: [ticket06-classroom-evidence](../../../docs/ticket06-classroom-evidence.md). Agent-reported checks: 99 passed (59 workbench, 40 Kaogong). Fresh tarball dependency/preset activation, Host restart binding restoration, native streaming/tools/approval/Stop and close-during-run continuation, actual-turn Skill injection, authenticated Chrome, material image pixels, desktop/narrow layout and installed sidebar comparisons remain pending. Automated checks do not complete the acceptance items below.

- [ ] 老师会话关联持久保存，关闭重开和宿主重启后可续聊。
- [ ] 保留图表和来源，材料作为数据传入，不当作系统指令。
- [ ] 教学 Skill 实际可加载，缺失时提示，不依赖开发者绝对路径。
- [ ] 会话缺失提供明确恢复选项，不静默新建。
