---
id: worktable-layout-single-minimize
parent: worktable-project-layout-spec
title: 单窗收起补位与展开恢复
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [worktable-layout-window-interaction]
---

最小UI已随 implement-spec 调用确认：收起按钮→标题恢复条→点击展开。独立 minimized 不改变 collapsed。单窗隐藏内容并释放面积，相邻展开窗补位；还原手动几何。保留已挂载应用、iframe、终端和草稿，不销毁/重启；隐藏内容 inert 并移出焦点。

收起窗仍参与 left→leftMore→top→main 编号、标注、任务归属。状态、左列高度和手动比例可保存冷恢复。实际 bundle 交互红绿测试和公开文件往返验收。

## Resolution

已实现单窗行为，区域/全部收起仍由10独立验收，最终安装包由07验收。

- 红灯：实际 SplitWorkspace DOM 操作找不到“收起窗口1”按钮；加入独立 minimized 操作、标题条恢复按钮与展开窗几何后通过。
- `split-minimize.test.mjs` 驱动实际按钮与分隔条，验证左窗收起后的上下补位、主窗收起后的左右补位、iframe节点及内部DOM保留、要求输入框节点及草稿保留、隐藏inert且焦点移出、原collapsed仍为原值。
- 公开 widgetTargets / WidgetMountRegistry / annotationTarget 在隐藏窗口后保留完整编号与绑定；拖拽仅更新可见邻窗的手动尺寸，隐藏窗基准保留，单纯自动补位不修改geometry。
- 通过实际共享文件存储保存/重读版本3后再次打开，恢复minimized状态、恢复入口和手动几何。`node --test plugins/worktable/04_test/split-minimize.test.mjs plugins/worktable/04_test/split-resize.test.mjs` 2/2；集成时 `npm run test:layout` 54/54（新增minimize由根统一加入门禁），新构建bundle锚点11/11。
- 本票没有宣称新包真实宿主点测，也未以此关闭10、07或父规格。
