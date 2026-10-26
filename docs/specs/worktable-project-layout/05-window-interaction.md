---
id: worktable-layout-window-interaction
parent: worktable-project-layout-spec
title: 补齐窗口宽高拖拽与保存
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: []
---

通过实际分隔条完成邻窗联动宽高拖拽，尤其是 leftMore 上下高度。保留最小尺寸和原生聊天空间，关闭重开仍恢复尺寸。

版本3契约：pane.minimized 为可选布尔值；geometry.leftHs 是以 paneId 为键的有限非负高度。geometry 中现有数值保存最近手动展开基准，自动补位只作派生渲染，不能回写覆盖基准。leftWs 保持宽度含义。新写入 version:3，兼容读取版本1/2并在首次升级写入前保留原字节备份。未知版本拒绝且原文件不变。共享校验、客户端快照和 CLI 同步支持。

在真实 bundle 分隔交互及实际存储/CLI公开接缝逐条红绿验证，更新 PRD。

## Resolution

已实现；最终包/真实宿主收口仍由07负责，未借源码测试提前宣称宿主验收。

- 红灯：真实存储版本3用例先报 `2 !== 3`；实现v3字段和升级备份后通过。之后通过备份冲突保留原文件、无效高度拒绝和CLI修改保留状态。
- 红灯：SplitWorkspace实际DOM Pointer交互先因没有左列高度分隔条失败；加分隔条、leftHs持久化及相邻分配后通过。随后left布局没有聊天拖拽入口、left+chatFull顶行覆盖聊天分别先失败，补齐入口与可用宽度后通过。
- 通过：`node --test 04_test/split-resize.test.mjs 04_test/project-layout-cli.test.mjs 04_test/project-layout.test.mjs` 13/13；`npm run test:layout` 38/38；工作树构建与实际bundle锚点11/11。路径均相对于plugins/worktable/01_content或其上级。Split测试直接导入完整公开组件并驱动实际分隔条DOM事件，不截取源码或检查私有变量；它不是最终安装包宿主验收。
- 覆盖：左列上下、主/顶行相邻宽度、上下分区、左右列/聊天宽、左侧聊天坐标、重开几何恢复、最小尺寸和边界；geometry.leftHs已接快照、文件恢复、浏览器缓存和项目保活池。
- 新写版本3；版本2原文件首次升级前生成同目录原字节备份，失败中止，旧版本1候选源继续保留，未知版本仍拒绝。CLI通过共享存储读写并保留新状态。
