---
id: harness-upgrade-support-policy
title: 确定新宿主兼容检查和升级发布规则
parent: harness-upgrade-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [harness-upgrade-native-research]
---

## Question

依据原生接口研究，首个 rc.3 适配包与未来宿主升级如何声明支持范围、集中能力探测、检查 SDK 消费者，并在不兼容时阻止加载或提供明确的局部不可用状态？未知新版本是等待验收后启用，还是允许用户显式试用，试用的隔离与回退边界是什么？

用户已确认不要求新包支持旧 alpha.2；本票不重新询问该范围。需要确定能写进规格的升级步骤和可证伪门槛，而非承诺未来全部兼容。


## Resolution · 2026-10-24

用户明确选择：正式环境等待兼容验收；未验收的后续 Harness 版本可由用户在独立实例显式试用。首个目标仍为 0.2.1-rc.3，alpha.2 仅保留旧冻结包回退。

正式支持使用官方实际门禁及准确版本声明，不以自定义 compatibility 字段或通配 peer 证明兼容。试用须明确未验收状态，使用独立 home/profile，不默认复用正式数据、迁移业务库或切换 3080；公开能力不足时停止相应功能，不绕过权限。每个支持版本以公开契约、新包真实安装、消费者与应用闭环为门槛。只有完成对应版本证据后才将其标为已验证；未知版本不能自动进入正式使用。

这是升级策略决定，不是新版本验收或正式部署批准。后续实施按新工单记录。
