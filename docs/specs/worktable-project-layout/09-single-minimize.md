---
id: worktable-layout-single-minimize
parent: worktable-project-layout-spec
title: 单窗收起补位与展开恢复
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-layout-window-interaction]
---

最小UI已随 implement-spec 调用确认：收起按钮→标题恢复条→点击展开。独立 minimized 不改变 collapsed。单窗隐藏内容并释放面积，相邻展开窗补位；还原手动几何。保留已挂载应用、iframe、终端和草稿，不销毁/重启；隐藏内容 inert 并移出焦点。

收起窗仍参与 left→leftMore→top→main 编号、标注、任务归属。状态、左列高度和手动比例可保存冷恢复。实际 bundle 交互红绿测试和公开文件往返验收。

## Resolution

待实施。
