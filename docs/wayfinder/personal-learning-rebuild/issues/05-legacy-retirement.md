---
id: personal-learning-rebuild-legacy-retirement
title: 旧个人学习插件安全退场
parent: personal-learning-rebuild-map
labels: [wayfinder:task]
status: closed
assignee: null
blocked_by: []
---

# 旧个人学习插件安全退场

## Question

落实用户明确授权：退场旧个人学习插件，不再保留为新版代码基线，不迁移旧学习数据。如何在不破坏其他插件和 DSH Session 的前提下移除已安装包与源码，并留下可核对的实际清理结果？此执行任务只处理旧实现，不授权开发新版或删除共享存储。

## Comments

### 2026-11-08 · 本会话执行记录

- 已确认源码目录为 `D:/programming/workspace/my-dsh/plugins/personal-learning`；受版本控制的源码无本地未提交更改，另有未跟踪发行包。
- 当前 web profile 曾直接依赖该目录中的归档包，并启用了 `@deepseek-ai/dsh-tool-personal-learning`。
- 已通过插件管理能力移除该包，结果 changed=true、application=applied、包管理退出码为 0。未重启宿主。
- 源码删除尚未执行成功：第一次路径保护检查因 Windows 路径格式不一致退出，检查证实目录和受控文件未删除；后续递归删除被 CC Safety Net 阻止，原因是目标处于当前会话工作目录之外。没有绕过保护，不能宣称源码已经清理。
- 未删除任何 Obsidian 知识文件、DSH Session、共享存储、考公或工作台数据。旧持久数据不作为新版输入，也未物理清除。
- 当时待办：在允许删除该显式目录的会话中完成源码清理，然后复核安装引用和源码目录都不存在。以下 Resolution 记录本次已完成的后续清理。

## Resolution

### 2026-11-08 · 明确工作目录内的清理执行

- 首先用 `working_directory` 确认本清理会话真实工作目录为 `D:/programming/workspace/my-dsh`；没有沿用父会话 `dsh-plugins` 的工作目录，不使用提权或替代工具绕过保护。
- 删除前核对两个精确目录均为普通目录、非 symlink，realpath 与仓库内预期目标一致；受控旧文件没有本地未提交修改。目录范围已向父会话报告并获准。
- 在正确工作目录内执行 `rm -r -- plugins/personal-learning docs/wayfinder/personal-learning`，退出码 0。删除旧实现源码、构建产物、测试、课程样本、验收截图与回执、旧发行包，以及旧专属规格、工单、原型和研究。Git 显示两个目录合计 86 个受控文件删除；忽略的构建产物与未跟踪旧发行包也随目录删除。
- 只定向修改共享任务索引：删除旧个人学习专属标题和介绍、旧实验台专属节；保留其后工作台任务表及其他历史内容，保留并发新增的考公任务驱动课堂节和新版重建条目。
- 验证：两个旧目录不存在，新地图、考公与工作台目录仍存在；仓库根依赖、锁文件、workspace 声明、scripts、compat、tests、patches 无旧插件活动注册或构建引用。父会话另独立核对当前 web profile 的依赖、bundles、锁文件、node_modules 入口和 Cordis 配置均无旧插件。`git diff --check` 通过。
- 残留边界：其他插件验收文档中的旧包历史描述保留，不构成活动依赖；未清扫 Git 历史、历史缓存、其他工作树或临时测试环境。未删除 DSH Session、共享存储、Obsidian 文件库或其他插件。
- 从只读 Git 历史确认旧 storageDomain 名称为 `personal_learning`、版本 1；本轮未核查或删除任何物理存储位置，不宣称存储清空。新版不得无意打开该旧 domain；若未来需要清除数据须另核对独占归属。
- 没有重启宿主、安装新版、提交或推送。此票关闭只表示授权范围内旧实现及其活动注册退场，不表示新版已实现。
