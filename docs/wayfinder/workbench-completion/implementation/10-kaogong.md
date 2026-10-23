---
id: workbench-completion-kaogong
title: 考公学习完整闭环
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-data, workbench-completion-native, workbench-completion-materials]
followup_target: 0.2.1-rc.3
followup_status: pending-decisions
followup_blocked_by: [harness-upgrade-kaogong-ownership, harness-upgrade-classroom-prototype]
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-24）

状态保持 open；考公已重新纳入 rc.3 与派生 Worktable SDK 的接入规划；工作台适配、旧学习归属和课堂原型仍是前置，尚未实施或验收。

原工单范围、依赖和未完成验收保留，rc.3 具体增量依据[框架规格 HU02、HU05—HU08](../../worktable-platform/framework-spec.md#host-upgrade-requirements)。followup_status 为 pending-decisions，路线见[升级地图](../../harness-upgrade/map.md)，不因旧 ready-for-agent 标签自动执行未决迁移。

- [ ] 以公开 SDK 接入应用/实例/视图/资源/私有能力/角色/任务，移除旧personal-workbench运行时依赖。
- [ ] 六领域及浏览器草稿按已确认实例归属隔离；旧笔记不整库公开，未知归属记录保留。
- [ ] 旧 Session/preset/cwd、学科老师与默认老师、历史绑定和选用Agent逐项映射，不新建老师替代恢复。
- [ ] 真实教学、十题评分/错题、课堂完成、计划统计、原生轨迹/审批/Stop及刷新重启恢复需新版本证据。

历史检查仍是旧环境证据；以下原始业务标准不删除、不计为新宿主通过。


# 10: 考公学习完整闭环

**What to build:** 学习者在独立学习窗口完成班主任安排、任课老师讲解、练习、总结和辅导讲评，刷新后继续学习。

**Blocked by:** 3 · 数据展示与模块联动；5 · DSH 原生执行闭环；8 · 考公题目与资料完整性。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 26、27、28；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 班主任、各任课科目和辅导员实际可用，真实教学 Skill 执行且历史独立。
- [ ] 教学引用当前资料和目标；资料与会话布局可切换，独立学习窗口不与统计面板挤在一起。
- [ ] 十题练习提交前隐藏答案，提交后正确评分与解析；继续下一轮不重复，并可将真实错题交给辅导员。
- [ ] 课堂目标、学习者总结、要求的反思、任务关联与完成确认持久化，重复确认幂等。
- [ ] 角色协作只读取声明必要的计划和总结，实际教学、练习成果和统计恢复形成连续流程。
- [ ] 浏览器与 Host 冷恢复保留全部业务记录、会话与布局；桌面/窄屏及输入过程可用。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
