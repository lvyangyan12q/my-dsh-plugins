# 当前规格与设计

## 当前框架入口 · 2026-10-20

当前派生实现以[Worktable AI工作台框架spec](../wayfinder/worktable-platform/framework-spec.md)为增量规格，[实现技术路线](../wayfinder/worktable-platform/technical-roadmap.md)与[交接](../wayfinder/worktable-platform/handoff.md)记录代码和后续缺口。首阶段11张工单已closed，完整spec仍open；不替代或自动关闭以下旧完整闭环规格。以下“尚未迁移/验收”的旧段落按其历史日期和版本读取。

<!-- native-compatible-plan -->
## 生效顺序

以当前完整闭环Spec的“当前生效边界”及用户最新指示为准：未经工作台补丁的原生DSH、插件适配、平台优先、考公暂缓。下列基础设计/接口文档保留参考；若包含新增原生插槽或内部编辑器接缝，不作为本轮实现依据。


返回 [进度入口](../STATUS.md)。

- [完整闭环Spec](../wayfinder/workbench-completion/spec.md)
- [路径图与决策](../wayfinder/workbench-completion/map.md)
- [应用平台基础规格](../wayfinder/application-platform/platform-spec.md)
- [应用接入与开发流程](../application-platform-extension.md)
- [工作台接口](../workbench-api.md)
- [工作台设计](../workbench-design.md)
- [插件UI风格](../plugin-ui-style.md)
- [安装与兼容说明](../workbench-install-compatibility.md)

阅读顺序：当前进度 → 完整闭环Spec → 路径图 → 对应工单。用户最新优先完成工作台平台，考公专项暂缓；原规格范围保持。

## Worktable 基线框架规格

[基于 Worktable 的 AI 工作台框架与应用接入规格](../wayfinder/worktable-platform/framework-spec.md)：本轮已确认产品与架构的增量规格。主验收接缝已由用户确认，状态open、标签ready-for-agent；不替代原123项要求，不代表已经迁移或验收通过。
