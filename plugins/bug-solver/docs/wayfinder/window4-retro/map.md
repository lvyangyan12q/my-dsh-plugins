---
id: window4-retro-collection-map
title: 窗口4收集、复盘与知识沉淀路线
labels: [wayfinder:map]
status: open
created: 2026-10-28
---

# 窗口4收集、复盘与知识沉淀路线

## Destination

形成窗口4可实施的增量规格：收集需求及对应代码/过程材料，执行有来源的复盘，按目标知识库规范沉淀。为后续优化 skill 和 agent 流程留资料；本期不做质量评分、评估运行或流程优劣比较。

## Notes

- 2026-10-28 已按用户调用to-spec发布[统一增量规格与任务索引](../../specs/bug-solver-next/spec.md)。本地图继续承载未解决的窗口4决策；发布规格不自动关闭本图或子票。

- 以用户2026-10-28最新澄清为准：现在只收集和复盘；此前质量优先讨论不作为本期目标。
- 复用[原窗口4规格](spec.md)，以[收集与复盘增量草案](collection-draft.md)记录当前修订建议；旧规格尚未整体对齐，不能直接据旧稿开工。
- 已核实 co-dev speckit 源码方法，见[能力对照](speckit-capabilities.md)；本轮只是阅读能力，没有执行外部写库、清理、优化命令。
- 继续会话咨询 wayfinder、grilling、domain-modeling。HITL问题由用户回答，不将推荐项默认关闭。
- 本地Markdown跟踪沿用仓库 docs/agents/issue-tracker.md：子票frontmatter存 parent/labels/status/assignee/blocked_by。前沿是open、未认领、所有阻塞票closed；先认领再处理，答案写Resolution后关票。本轮只建图。
- 运行 `node docs/wayfinder/window4-retro/frontier.cjs` 查询前沿；地图不重复列开放票。
- [独立代码审查](../../reviews/2026-10-28-design-audit.md)单独交付。历史resolved不代表本轮问题已修复。

## Decisions so far

- 2026-10-28：配置按项目保存默认知识库和收集选项，单次复盘可以临时覆盖。材料引用/快照及会话适配仍待决定。

- 2026-10-28：01收集范围已确认并关闭。支持手动选择成功、失败、中断及可识别的历史任务，收集已有材料并标明缺项，不默认复制全仓或完整会话。02会话来源与03存储归属成为当前前沿。

## Not yet specified

- 会话接入方式确认后，再细化日志截断、来源丢失及增量续读的恢复交互。
- 知识库归属确认后，再细化目标库特有的文章、索引和处理状态写回。
- 来源材料结构确定后，再细化窗口布局与材料清单编辑交互。

## Out of scope

- 质量评分、评估执行器、流程优劣比较；不作为本期验收门槛。
- 自动改skill/规则、模型训练、自动合入与自动清理源材料。
- 本轮业务实现、安装或重启。路线完成表示可开工，不表示窗口已交付。
