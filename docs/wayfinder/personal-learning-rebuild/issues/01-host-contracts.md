---
id: personal-learning-rebuild-host-contracts
title: 文件式课堂与原生内嵌会话的宿主可行性
parent: personal-learning-rebuild-map
labels: [wayfinder:research]
status: closed
assignee: null
blocked_by: []
context_branch: research/personal-learning-rebuild-host-contracts
---

# 文件式课堂与原生内嵌会话的宿主可行性

## Question

当前实际 DSH 宿主有哪些公开能力，可在独立插件内同时承载真实 Session 的输入、输出、工具、Stop、提问和审批，且不跳转到原生会话页面？文件读写、原生打开文件、布局生命周期有哪些可复用合同和已知限制？区分接口存在、源码推论和实际浏览器验证，不修改宿主或用假聊天替代。

## Resolution

2026-11-08 · 仅完成源码合同研究，不等于新版或真实浏览器验收通过。

- 真实内嵌有当前公开组合路径：`sessions.retain` → 自有 `SessionReference` → 框架 `SessionProvider` → `conversation.content` Factory；复用官方输入、输出、工具、提问和审批，不需要跳转或假聊天。
- 这些公开 API 是 pre-stable。释放 Client 引用不等于停止 Host 回合，同一 Session 不应同时拥有两个可编辑 composer。
- 笔记保存缺口：`workspaceFiles` 只有读取能力，需要新插件设计受控 Host 写入入口，处理知识文件库边界与版本冲突。
- 原生文件打开缺口：当前独立全局面板会清空官方 Sidebar 的 on-screen Session，不能直接保证留在课堂时调用官方侧栏打开文件。这是源码发现，尚未做浏览器验证，需要后续接入决策，不可用隐藏跳转规避。
- Worktable 当前 overlay/DOM 锚定实现不是独立主面板 Session 绑定的公开验收范例。

研究资产：[宿主合同研究](<D:/programming/workspace/dsh-plugins/.research/personal-learning-rebuild-host-contracts/docs/research/personal-learning-rebuild-host-contracts.md>)。隔离分支 `research/personal-learning-rebuild-host-contracts`，提交 `0197b9362b6a369394b3119297857984ed815b67`，只包含报告。推送正常尝试一次，被安全审核拒绝、命令未执行；未绕过，未合并，未建 PR。父会话复读公开 Session 引用、只读文件服务及侧栏清空源码，结论与报告一致。

未执行：宿主变更、安装或重启、付费模型调用、真实内嵌与文件打开的浏览器验收。
