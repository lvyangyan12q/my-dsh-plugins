# 01 今日真实任务续学

2026-11-05。今日与计划复用同一start恢复编排，按档案持久最近任务身份，任务内答案/反思/笔记编辑更新最近活动。移除重复今日区块，阶段显示中文。复习按具体发生项直接进入复习模式；overview/plan/progress导航及按视图的计划筛选/滚动持久化。

公开页面TDD：今日和最近入口分别red→green；同任务/切任务/卸载重建答案与总结恢复；具体错题目标red→green。client全套27/27通过。实际筛选/滚动持久化还需专项页面断言；准确包、Native模型和真实桌面窄屏视觉验收尚未执行，不能以源码代替。

专项补齐：通过真实Sdk双owner Provider、卸载并重建root/pool验证计划筛选、滚动和导航同视图恢复、另一视图隔离。任务编辑最近活动测试先red，改为实际practice.context.taskId/lesson.request.taskId后green，不依赖残留activeId。完整client28/28通过；源码合同待集成审查，准确包与实际视觉留08。
