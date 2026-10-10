---
id: workbench-completion-data
title: 数据展示与模块联动
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-authoring]
---

# 03: 数据展示与模块联动

**What to build:** 用户在模块里连接应用自有真实数据，使用筛选、列表、统计和详情联动并保存恢复。

**Blocked by:** 2 · 手动创建完整应用。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 9、10、11、15、31；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 连接明确显示来源、应用/实例归属、资源及依赖状态；不隐式读取其他应用私有数据。
- [ ] 同一筛选更新统计和列表，选择更新详情；重开及刷新保留声明和应持久的状态。
- [ ] 展示、选择及筛选零隐式模型请求；加载、空数据、失败和重试清楚区分。
- [ ] 数据展示 Skill 将声明范围的数据经可编辑预览准备为任务；真实发送留给原生执行工单。
- [ ] 地图扩展与应用提供的坐标接口保留；未提供真实数据时不制造验收数据或宣称真实地图服务完成。
- [ ] 实际安装应用的连接编辑、联动、持久化和数据隔离通过用户流程验收。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
