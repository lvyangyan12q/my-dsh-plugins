---
id: worktable-layout-region-minimize
parent: worktable-project-layout-spec
title: 整行整列及全部收起的布局恢复
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [worktable-layout-single-minimize]
---

区域内全部窗格收起后，仅留必要恢复入口，其他区域自动扩展；全部内容窗收起仍能找回每个窗格。窄屏下无不可恢复空白、越界或重叠，保留宿主聊天最小空间。通过真实 bundle 交互覆盖整行、整列、全部收起、展开及视口变化。

## Resolution

已实现；新候选包实际安装与宿主点测仍由07负责。

- 红灯：全部窗格收起后宿主聊天仍保持520px而应使用释放后的1800px；统一workspaceGeometry供原生margin和窗格渲染后通过。整列释放宽度、顶行释放高度、主行收起后原生区补位，chatFull下顶行填满剩余内容高度。
- 全部收起时标题恢复入口保持完整可用宽度，恢复条可以水平滚动；文件保存/重读后再次打开仍有六个恢复入口，原生区填满且手动geometry保持原值。
- 窄屏原生显隐与窗格显示共用narrowSelection；全部收起显示原生对话，选择收起窗会展开它。600px窄屏打开再切回1800px时保留手动chatW520/topH280/leftW280。仅显示投影作视口钳制，不再在打开时将chatW按当前视口上限写回。
- 极短视口用例先失败（顶行/主行超出100px视口），改为沿用可恢复的单窗模式后通过；不制造负尺寸或覆盖手动基准。
- 三个公开SplitWorkspace真实DOM专项3/3；新构建最终bundle锚点11/11。新增split-region-minimize.test.mjs由根接入layout及pack门禁。最终包及最高宿主接缝证据继续在07记录，不以本票替代。
