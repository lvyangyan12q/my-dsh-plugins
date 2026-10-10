---
id: workbench-completion-annotation
title: 画布标注与模块生成
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-authoring, workbench-completion-native]
---

# 06: 画布标注与模块生成

**What to build:** 用户在画布任意位置提要求，预览上下文，经真实原生任务生成或调整指定模块并保存。

**Blocked by:** 2 · 手动创建完整应用；5 · DSH 原生执行闭环。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 17、18、23、24；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 任意画布位置、模块及页面的标注可创建、编辑、取消、保存、重开；坐标和目标关联稳定。
- [ ] 提交前展示目标角色、页面/模块和来源；用户可移除上下文，明确发送后才调用模型。
- [ ] 模块生成与页面调整 Skills 在真实会话执行，结果关联原目标并可预览、修订和保存。
- [ ] 生成失败、取消、Stop、依赖缺失和页面切换不覆盖已有运行版本或其他模块。
- [ ] 更新后的模块在实际应用可加载使用，刷新和 Host 冷启动后成果保持。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
