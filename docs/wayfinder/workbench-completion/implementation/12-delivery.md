---
id: workbench-completion-delivery
title: 正式部署与远程交付
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-release]
---

# 12: 正式部署与远程交付

**What to build:** 用户在正式 3080 使用与远程仓库一致的工作台，并可按说明启动及新增应用。

**Blocked by:** 11 · 兼容、升级与回滚验收。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 33；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 审查整个集成分支与用户确认基线，修复全部有效问题；父规格和原工单仅在完整对应验收通过后关闭。
- [ ] 隔离发布验收通过后同步正式插件，核对运行包来源/版本、保留原生菜单、开源 Worktable、Agent 改动与用户数据。
- [ ] 正式 3080 冒烟确认主要入口和接入应用可用，部署失败有已验证回滚路径。
- [ ] 最新实现和去隐私证据同步既有远程仓库/PR；本地、归档、正式运行和远程状态分别核对。
- [ ] 提供启动、应用搭建、数据/角色连接、升级与恢复说明；清理本次自建工作树而不动用户保留目录。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
