---
id: personal-learning-rebuild-session-context
title: 课堂会话归属与学习上下文切换
parent: personal-learning-rebuild-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

# 课堂会话归属与学习上下文切换

## Question

一门课程、一组知识点和一个学习主题如何关联 DSH Session？切换讲义时如何保持草稿、笔记和进行中的生成，哪些文件、选文和实验状态在何时交给模型？刷新、收起和离开课堂是否只卸载视图而不停止会话，返回时如何恢复？与人类明确交互语义；具体宿主实现受宿主可行性研究约束。

## Resolution

2026-11-09 · 已并入[学习课堂规格](../spec.md)。

- 一个学习空间绑定一个标准预设 DSH Session，首次提问或显式打开时创建，`sessionId` 存在插件状态。
- 内嵌用 `sessions.retain` 自有引用 + `SessionProvider` + `conversation.content` 的 embedded 变体，不跳转、不重建聊天。
- 收起、切课、离开只释放客户端引用，不取消 Host 回合；Stop 必须由用户显式操作。切回重新 retain。
- 同一空间只渲染一处可编辑 composer。
- 交给模型的上下文是显式的：当前讲义文件、选中文字、当前笔记片段；不是整库自动注入。
- 刷新/重启后按学习空间恢复课程、笔记文件、栏宽与滚动锚点；会话历史留在 Host。
