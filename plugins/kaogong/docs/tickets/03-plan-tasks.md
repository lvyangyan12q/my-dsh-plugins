---
id: kaogong-standalone-03-plan-tasks
title: 完整计划、安排与任务
status: closed
assignee: codex/kaogong-ticket03
blocked_by: [kaogong-standalone-02-study-data]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 设置考试日期/模块数/权重，预览确认生成基础/强化/冲刺全程日程。
- 任务stableID及计划revision关联课堂/练习；按日/周/全程查看、延期、追加、调整差异与历史。
- 未配置无默认倒计时；只自动生成可执行任务，外部模考单列；完成依据按spec。

## 验收
- [x] 重排未来不改已完成/默认不动进行中，过期页面拒覆盖，容量不足明确提示。
- [x] 学习总结确认、练习真实轮次与反思确认能回写任务/进度；Native结束不触发完成。

## Resolution
已完成源码与公开接口/页面验收，见 [03证据](../evidence/03-plan-tasks.md)。独立增量计划域保存nullable目标、稳定任务、提案差异、确认版本与完成依据；旧原题/评分/学习域保持原格式。准确发行包真实无工作台完整验收仍由07覆盖，不以本票构建代替。
