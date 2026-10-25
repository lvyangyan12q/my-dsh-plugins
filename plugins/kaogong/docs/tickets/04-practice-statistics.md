---
id: kaogong-standalone-04-practice-statistics
title: 练习历史与可信统计
status: open
assignee: null
blocked_by: [kaogong-standalone-02-study-data]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 保留Host发题/不可变原题快照/提交前隐藏答案/幂等判分/未交卷恢复。
- 累计来自已提交轮次；notebook负责归纳，重复题跨轮次保留。
- 本轮与累计、提交/作答/未答/去重题量及任务完成率分开，手工/外部自报不混系统成绩。

## 验收
- [ ] 同10题两轮不只算10题；同轮重提不重复；3对2错5未答口径可核。
- [ ] 后来题库变更不改原轮次；刷新/重启后轮次与反思不丢。

## Resolution
尚未实施。记录准确源码/包、实际结果和仍缺项后才能关闭。
