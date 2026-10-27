# 当前实施工单

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
