---
id: worktable-layout-window-interaction
parent: worktable-project-layout-spec
title: 窗口收起补位与完整尺寸拖拽
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
design_status: proposed-for-pr-review
---

实现父规格新增窗口交互：单窗/整行/整列收起后释放面积，展开窗自动补位；分隔条调整宽高并支持左列上下高度；稳定身份、内容与运行上下文保留。最小标题恢复条交互在草稿 PR 中审阅，实施前遵守仓库 UI 设计确认规则。

新增独立收起状态，不改变原 collapsed 的隐藏标题栏含义；手动几何与自动补位分开，保存左列高度和展开基准。采用明确的新文件版本与兼容迁移，不能覆盖 rc.3.4 冻结资产。

沿用已确认真实 Worktable 交互及存储接缝，测试收放、补位、全部收起、尺寸约束、运行上下文、版本往返；不通过源字符串断言模拟行为。

## Resolution

仅规格与设计提案已整理；尚未实现或验收。
