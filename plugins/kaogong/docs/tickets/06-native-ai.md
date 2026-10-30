---
id: kaogong-standalone-06-native-ai
title: 私有老师与AI确认闭环
status: closed
assignee: null
blocked_by: [kaogong-standalone-03-plan-tasks, kaogong-standalone-04-practice-statistics, kaogong-standalone-05-errors-review]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 班主任计划进度、任课老师科目教学、辅导员错因复习；保留kaogong-teach与已有角色身份。
- 计划/调整/完成建议进入页面预览，用户确认后写；真实Session决定工具所属档案。
- 课堂准备不发送，明确发送后跟踪真实Native接纳/flush回执，未知不自动重发。

## 验收
- [x] 真实模型/私有Skill/上下文读/提问/审批拒绝和允许一次/Stop通过。
- [x] 普通会话不可读写考公，切角色保留内容和各自Native草稿，AI不改答案/成绩或自动打卡。
- [x] 无模型时手动计划/阅读/练习/判分/反思/统计仍可使用。

## Resolution
2026-10-28关闭。真实Native模型矩阵、惰性建议与页面确认、独立角色/草稿和未绑定会话隔离通过；无模型手动闭环通过。最终发行SHA、字节等价关系及逐项结果见[最终验收](../evidence/07-final-acceptance.md)。原始材料/评分及真实Session归属未放宽。

01交接：普通Native会话已排除私有考公工具，但这不等于模型写入安全完成。06须逐一审计当前businessRegistry所有写工具（包括bank、knowledge、record、practice提交及plan_set/done），改为只读/建议，或具有明确页面确认的允许操作；不得由AI改写原题答案、评分快照或自动完成学习任务。HTTP学习者手动操作仍须可用。
