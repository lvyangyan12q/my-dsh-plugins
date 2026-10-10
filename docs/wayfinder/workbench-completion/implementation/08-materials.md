---
id: workbench-completion-materials
title: 考公题目与资料完整性
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

# 08: 考公题目与资料完整性

**What to build:** 学习者在资料和真实练习里看到完整题目、选项、图表和来源，原资料与学习记录保持。

**Blocked by:** None (can start immediately)。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 29、30；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 对照原资料建立题目身份与图表来源关联，修复缺图、错误引用和选项页脚污染；不猜写内容或修改答案。
- [ ] 提交前不暴露答案或解析，提交后真实成绩、解析与来源保持可信。
- [ ] 真实历史资料图片、表格、原文引用在实际安装页面可访问、滚动和阅读，窄屏无遮挡。
- [ ] 复核图像关联与裁剪不包含泄漏解答，路径与静态资源访问边界仍生效。
- [ ] 题库、知识、计划、错题历史身份与字段保持，正式资料不上传到远程；旧目录保留观察。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
