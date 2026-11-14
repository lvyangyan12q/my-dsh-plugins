---
id: personal-learning-rebuild-file-ownership
title: 讲义笔记与课程脉络的文件及编辑边界
parent: personal-learning-rebuild-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

# 讲义笔记与课程脉络的文件及编辑边界

## Question

首版如何选定知识文件库、识别课程目录并关联讲义、个人笔记、Canvas 与动态附件？笔记按课还是按主题组织，哪些内容可由 AI 创建或修改，现有文件如何导入或只读引用？双链、批注和外部编辑冲突如何避免丢失与覆盖？Canvas 首版是只读导航还是允许修改？结合[宿主可行性研究](01-host-contracts.md#resolution)，如何选择受控文件保存与独立课堂内原生打开文件的接入方案，是否需要宿主能力增补？与人类确认最低必要范围，不把助手建议当已确认需求。新版数据身份必须与退场旧实现分离，不得自动读取[旧插件退场记录](05-legacy-retirement.md#resolution)所标识的旧存储。

## Resolution

2026-11-09 · 已并入[学习课堂规格](../spec.md)，不再单独立项。

- 知识文件库为单个显式选择的本地根目录；每个学习空间是根下一个文件夹，含 `讲义/`、`笔记/`、`脉络.canvas`、`附件/`。
- 课程目录由文件系统推导（文件名排序，frontmatter 可覆盖 `order`/`title`），不另存清单。
- 正文（讲义、笔记、脉络）只存在于文件中；插件存储域只保存导航与绑定。
- 老师只能写 `讲义/`、`脉络.canvas`、`附件/`，不能改写 `笔记/`。
- 写入口放在插件 Host 服务（受控路径、原子写、内容哈希版本、冲突拒绝），因为宿主 `workspaceFiles` 只有读取能力。
- Canvas 首版只读查看与跳转，编辑交给 Obsidian。
- 新版使用独立存储域 `learning_classroom`，不读旧 `personal_learning`。
