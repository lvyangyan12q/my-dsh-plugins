# 当前实施工单

## 学习与复习体验改版（2026-11-04）

具体实现路径在[学习与复习改版决策地图](../wayfinder/learning-review/map.md)整理。决策现已定稿，按实施票依赖推进；当前规格 execution_readiness 为 ready；不把决策票当实施切片或已完成开发。

本地工单 [08：按已确认 Open Design 原型改版](08-learning-review-experience-spec.md)，身份 `kaogong-08-learning-review-experience`，状态 `open`，唯一 triage 标签 `ready-for-agent`。本票持有增量规格唯一正文：今日、学习路线、复习中心、学习进度及原生课堂收尾。沿用用户此前确认的公开接口和准确发行包测试边界；原型批准不等于实现完成。以下 00—07 状态仍表示历史独立版交付。

2026-11-05：已按用户确认的 8 片拆分发布[本轮实施 tickets](../../.scratch/learning-review/issues/README.md)，逐票记录依赖和验收条件。决策门槛已按后续用户回复定稿，生成工单不表示已开始或完成实施。

## 历史独立版实施

本地Markdown为工单源，读取各票status/blocked_by，不从历史closed推断本轮完成。2026-10-28，00—07均closed；最终准确包、无Worktable真实完整闭环、正式独立profile注册与E3原位升级见[最终验收](../evidence/07-final-acceptance.md)。历史工作台适配和源码测试未作为本轮实装替代。

| 票 | 标题 | 依赖 |
|---|---|---|
| [00](00-directory-consolidation.md) | 目录、文档与资料收拢 | 无 |
| [01](01-native-standalone.md) | 独立Host、原生入口及课堂 | 00 |
| [02](02-study-data.md) | 备考档案与当前数据承接 | 01 |
| [03](03-plan-tasks.md) | 完整计划、安排与任务 | 02 |
| [04](04-practice-statistics.md) | 练习历史与可信统计 | 02 |
| [05](05-errors-review.md) | 错题归纳与复习 | 04 |
| [06](06-native-ai.md) | 私有老师与AI确认闭环 | 03,04,05 |
| [07](07-acceptance-delivery.md) | 真实全闭环、恢复与交付 | 03,04,05,06 |

共同规格见 ../spec.md；目录约定见 ../migration.md；现场与授权见 ../HANDOFF.md。
