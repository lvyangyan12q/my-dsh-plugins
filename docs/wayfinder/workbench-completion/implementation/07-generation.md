---
id: workbench-completion-generation
title: AI 创建应用闭环
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-data, workbench-completion-annotation]
---

# 07: AI 创建应用闭环

**What to build:** 用户描述需求生成应用草稿，再在模块画布修改、预览、启用并恢复使用。

**Blocked by:** 3 · 数据展示与模块联动；6 · 画布标注与模块生成。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 16、23、24；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 应用搭建 Skill 经真实模型生成可编辑应用配方和必要内容，结果不直接启用运行版本。
- [ ] 生成后页面、模块、数据声明和角色可继续编辑；预览与显式启用完成连续流程。
- [ ] 无效结果、取消/Stop、重复点击、缺失依赖与失败恢复不破坏已有应用。
- [ ] 成果使用已有平台模块和自有能力边界，不建立第二套能力库或安装器。
- [ ] 实际保存、启用、修改版本、刷新与 Host 冷重启恢复通过；原型和固定生成夹具不作通过证据。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
