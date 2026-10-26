---
id: kaogong-standalone-04-practice-statistics
title: 练习历史与可信统计
status: closed
assignee: practice-statistics
blocked_by: [kaogong-standalone-02-study-data]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 保留Host发题/不可变原题快照/提交前隐藏答案/幂等判分/未交卷恢复。
- 累计来自已提交轮次；notebook负责归纳，重复题跨轮次保留。
- 本轮与累计、提交/作答/未答/去重题量及任务完成率分开，手工/外部自报不混系统成绩。

## 验收
- [x] 同10题两轮不只算10题；同轮重提不重复；3对2错5未答口径可核。
- [x] 后来题库变更不改原轮次；刷新/重启后轮次与反思不丢。

## Resolution
2026-10-27：实现与公开边界验收完成。详情见 [04证据](../evidence/04-practice-statistics.md)。成绩统计只读取全部已评分轮次快照；提交、实际作答、未答、去重、实际答错及全部提交题量分母独立呈现。原发题/判分/快照存储格式保持不变，notebook仅负责投影及个人归纳。准确发行包的真实Native全学习闭环仍由07验收，不以本票源码测试替代。
