---
id: harness-upgrade-support-policy
title: 确定新宿主兼容检查和升级发布规则
parent: harness-upgrade-map
labels: [wayfinder:grilling]
status: open
assignee: null
blocked_by: [harness-upgrade-native-research]
---

## Question

依据原生接口研究，首个 rc.3 适配包与未来宿主升级如何声明支持范围、集中能力探测、检查 SDK 消费者，并在不兼容时阻止加载或提供明确的局部不可用状态？未知新版本是等待验收后启用，还是允许用户显式试用，试用的隔离与回退边界是什么？

用户已确认不要求新包支持旧 alpha.2；本票不重新询问该范围。需要确定能写进规格的升级步骤和可证伪门槛，而非承诺未来全部兼容。
