---
id: kg-completion-contract
title: 一次确认如何可靠完成任务并安排复习
parent: kaogong-learning-review-map
status: open
labels: [wayfinder:grilling]
assignee: null
blocked_by: [kg-route-identity, kg-queue-plan]
---

## Question

在复用既有课堂确认回写计划的基础上，哪些条件构成完成？有多轮匹配练习时如何选择？完成已保存但复习入队失败时，用户应该看到什么、怎样重试而不重复完成？

现有事实：课堂、计划任务是不同记录；lesson/confirm 已串联更新计划，尚非统一跨领域事务；任务练习可稳定续作，但课堂关联轮次仍有显式操作。任务与课堂对部分作答的条件也不同，不能因重组 UI 静默修改。

推荐默认自动关联唯一明确匹配依据，有歧义用可读轮次信息选择；草稿、完成与入队效果分开记录，页面集中确认，部分成功诚实显示并可恢复。讨论不要求练习的课、未答题和自主学习完成条件。

关闭需要：用户核对可见完成条件与失败反馈、操作身份和恢复顺序、保留已有规则与需要变更的精确列表。此票不直接重写完成模块。
