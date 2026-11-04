---
id: kaogong-learning-review-map
title: 考公学习与复习改版的具体实施路径
status: open
labels: [wayfinder:map]
assignee: null
blocked_by: []
---

## Destination

形成可交接实施的改造路径：以已批准的 Open Design 原型为体验目标，以当前领域代码为底座，明确数据关联、复习规则、操作合同、页面替换顺序及发行验收。地图结束表示实现前的决定已清楚，不表示插件已改完。

## Notes

- 依据：[增量产品规格](../../tickets/08-learning-review-experience-spec.md)、[当前实现评估](../../evidence/08-implementation-assessment.md)。原型批准和代码核对是已有输入，不重新要求评审视觉，不把静态检查当运行验收。
- 本轮仅规划；不改源码、不建第二插件、不迁移真实资料、不启动正式 3080、不安装发行包。现有原题、成绩、档案、会话、cwd 与回退材料保护约束保持。
- 每次先读取地图。决策票使用 grilling 与 domain-modeling；确需交互验证才使用 prototype；明确需要外部事实时另建 research 票，不预设无必要的外部研究。
- 本地 Markdown 是仓库选定的 tracker。子票以 frontmatter 的 parent 建父子关系；blocked_by 是本地无原生依赖 API 时的阻塞关系。运行 `./frontier.ps1` 查询开放、未认领且阻塞全闭合的票；`-All` 查看全部及阻塞标题。
- 领取时先设 assignee；回答记录在票内 Resolution，关闭后清空 assignee 并向 Decisions so far 添加标题链接。每次至多解决一个非研究票；本次建图不解决子票。地图及子票仅带 wayfinder 标签。
- 本轮沿用“保留底座、重组页面、增量新增领域”的评估建议，不默认为所有细节已获批准。特别是上一版规格补写的主动回忆间隔、自评回退与覆盖分母应经决策票澄清后修订，不能作为用户已经确认的事实。
- 下游实施须在决策完成后形成纵向可验收切片；具体切片顺序由交付决策票持有，地图不重复存储答案。

## Decisions so far

- [学习路线以什么为主，以及何时算作已学](issues/01-route-identity.md)：沿用大纲与原型覆盖口径，学习完成和复习状态分开，入队不等于已学。
- [到期复习与正式学习计划如何衔接](issues/02-queue-plan.md)：独立提醒、确认后排入；跨入口或提前完成同步同一计划项，下一周期不自动排期。
- [主动回忆与错题重做各自怎样确认和推进](issues/03-review-contract.md)：回忆按自评安排1/3/7天，错题保留既有三阶段，分别记录且不推算掌握率。

## Not yet specified

无未能表述成具体问题的已知范围。后续如样例映射揭示真实资料无法对应大纲、宿主公开界面限制或恢复合同冲突，再据证据补票；不预先拆分未知工作。

## Out of scope

- 整插件重写、通用课程平台、工作台嵌入和 Harness 源码修改。
- 本轮执行开发、正式数据迁移、安装、发布或推送。
- 自适应记忆算法、科学掌握率预测、外部通知和系统内限时整卷模考。
- 已确认视觉的重复评审；仅对新增规则无法用文字判断时补充局部交互原型。
