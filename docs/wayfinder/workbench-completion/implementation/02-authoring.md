---
id: workbench-completion-authoring
title: 手动创建完整应用
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: codex-completion-authoring
blocked_by: []
---

# 02: 手动创建完整应用

**What to build:** 用户从布局开始在模块内配置，完成多页面应用的草稿、预览、启用、修改和重开编辑。

**Blocked by:** None (can start immediately)。

**Status:** claimed


**范围关系：** 补充规格 User Stories 6、7、8、14、15、31；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 保留已确认布局和模块内配置交互；集中表单仅作为高级配置。
- [ ] 配置网站、手动自定义内容、动画、资源和对话模块的位置及声明；需 AI 的内容生成留给其专属工单。
- [ ] 添加、改名和切换页面，调整模块位置/尺寸、聚焦模块并复用结构模板；刷新后身份与布局保持。
- [ ] 保存草稿和预览不修改运行版本；显式启用、修改运行版本及校验失败的保留行为通过实际 UI 和持久化验收。
- [ ] 无效配置、缺失模块、取消编辑和重试均有可操作反馈；配置界面不遮挡下拉框、按钮和筛选。
- [ ] 已有应用和原生菜单、草稿、业务数据保持；完整手动流程不调用模型。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
