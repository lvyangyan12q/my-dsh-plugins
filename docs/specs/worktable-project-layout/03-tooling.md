---
id: worktable-layout-tooling
parent: worktable-project-layout-spec
title: 布局工具及持久化文档
labels: [ready-for-agent]
status: closed
assignee: tooling
blocked_by: [worktable-layout-storage]
---

将 bug-solver 布局脚本改为一项目一文件、使用共享存储协议、保留查看/备份/调整功能并去除硬编码项目ID。只提交布局工具所需文件，不夹带新插件运行数据、配置、ACL 或截图。

在临时项目目录实际调用 CLI 并重读验证。同步 worktable README、持久化 PRD 和必要命令说明，不将布局文件称作应用业务数据备份。

## Resolution

2026-10-26 完成。布局脚本改为共用布局存储模块，支持固定主文件、稳定项目身份、指定目录、旧候选迁移、备份、左列叠放窗改名及预期修订检查。普通数量调整保留窗格与标签内容；删除含内容窗格需明确参数，保存前备份。损坏文件、身份变更和过期修订均拒绝覆盖。

实际 CLI 接缝采用先红后绿的创建/读取与比例调整用例，并补充内容保留、备份、迁移和旧文件保护回归。独立临时项目目录中 CLI 5 项通过；合并当时集成分支后，存储、受认证接口、客户端队列与 CLI 合计 21 项通过，0 失败。已加入 `test:layout` 和正式打包兼容门禁；最终安装包和真实宿主验证由工单04记录，不能据此宣称已经通过。

同步 Worktable README、持久化 PRD 和脚本说明；未修改或提交 bug-solver 的业务配置、运行数据、ACL 文件和截图。
