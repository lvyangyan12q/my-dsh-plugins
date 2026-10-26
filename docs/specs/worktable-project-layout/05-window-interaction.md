---
id: worktable-layout-window-interaction
parent: worktable-project-layout-spec
title: 补齐窗口宽高拖拽与保存
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

通过实际分隔条完成邻窗联动宽高拖拽，尤其是 leftMore 上下高度。保留最小尺寸和原生聊天空间，关闭重开仍恢复尺寸。

版本3契约：pane.minimized 为可选布尔值；geometry.leftHs 是以 paneId 为键的有限非负高度。geometry 中现有数值保存最近手动展开基准，自动补位只作派生渲染，不能回写覆盖基准。leftWs 保持宽度含义。新写入 version:3，兼容读取版本1/2并在首次升级写入前保留原字节备份。未知版本拒绝且原文件不变。共享校验、客户端快照和 CLI 同步支持。

在真实 bundle 分隔交互及实际存储/CLI公开接缝逐条红绿验证，更新 PRD。

## Resolution

待实施。
