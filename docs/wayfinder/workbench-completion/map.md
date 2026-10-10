---
id: workbench-completion-map
title: 工作台完整闭环与交付决策地图
labels: [wayfinder:map]
status: open
---

## Destination

明确保留全部既有需求的工作台完整闭环和交付路径，解决实施接缝及验收条件的不确定性，并形成可执行规格与后续实施工单。地图完成表示路线清楚，不表示生产实现已完成。

## Notes

用户于 2026-10-10 确认完整范围和最高用户流程验收接缝；[工作台完整闭环与交付规格](spec.md)已发布为 ready-for-agent，补充原规格而不替代原 123 条要求。

采用项目本地 Markdown 跟踪器及 frontmatter。子工单 parent 指向本地图，blocked_by 使用真实本地 ID；只有 open、无 assignee 且阻塞全部 closed 的子工单可领取。地图不重复列出开放工单。沿用 to-spec、wayfinder；讨论决策使用 grilling、domain-modeling；研究使用 research。先认领再工作；答案写在工单的 Resolution 中，地图只索引已解决工单。

本地图为规划，不携带生产执行。既有确认是终点和约束，不冒充本地图已关闭的决策工单。保留原生菜单、开源 Worktable、应用私有能力、Agent 改动和旧考公观察目录。

## Decisions so far

尚无已关闭的本地图子工单。

## Not yet specified

当搭建闭环差距与真实模型条件清楚后，进一步确定每项缺口应该修复产品行为还是补充验收，以及对应实施任务之间的最小依赖。现有视觉、资料和迁移差距的处理顺序将在验收覆盖调查后细化。

## Out of scope

本地图本身不执行生产修复或部署，也不重开已确认产品定位。未确认的新市场、多人协作、替换原生核心及扩大第三方版本支持不纳入此地图；原要求仍由原规格约束。
