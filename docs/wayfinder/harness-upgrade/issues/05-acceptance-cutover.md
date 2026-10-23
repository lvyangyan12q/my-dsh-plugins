---
id: harness-upgrade-acceptance-cutover
title: 确定工作台与考公的验收、切换和回退门槛
parent: harness-upgrade-map
labels: [wayfinder:grilling]
status: open
assignee: null
blocked_by: [harness-upgrade-support-policy, harness-upgrade-kaogong-ownership, harness-upgrade-classroom-prototype]
---

## Question

在升级策略和考公归属确定后，如何安排“工作台先适配 → 考公接入 → 旧记录恢复 → 正式切换”的真实用户流程验证？哪些失败必须阻止正式安装，如何保留原生菜单、对话/轨迹/审批/Stop、资料引用、评分及重启恢复，并保证回退不覆盖升级后新增数据？

需要明确两层验收的准确版本、隔离实例与原数据检查、发布组合、停机/切换步骤，以及回到已验冻结包的前提。原生构建、夹具通过或目录可见不能替代应用闭环；桌面等历史未验范围不在本轮自动提升。
