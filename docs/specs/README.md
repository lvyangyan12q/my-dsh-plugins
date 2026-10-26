# 当前规格与设计

## 2026-10-26 项目布局落盘方案

[Worktable 项目布局落盘与恢复调整方案](worktable-project-layout.md)：一个项目固定使用一份 `.dsh-worktable/layout.json`。实现与最终包真实 Windows Web 验收已完成，等待远程推送核对；详见[验收回执](worktable-project-layout/04-acceptance.md)与[两轴审查](worktable-project-layout/review.md)。

## 2026-10-24 升级规格已回写

当前要求以[框架规格 HU01—HU08](../wayfinder/worktable-platform/framework-spec.md#host-upgrade-requirements)为详细入口；[旧完整闭环规格](../wayfinder/workbench-completion/spec.md)已同步当前宿主与考公接续边界，[后续范围](../wayfinder/worktable-platform/continuation-spec.md)保留历史阶段并链接新升级。

目标先 rc.3、后续逐版验证，旧 alpha.2 只留冻结回退。四项[路线决策](../wayfinder/harness-upgrade/map.md)仍开放，ready-for-agent 不表示未决升级已经可执行；原故事、原123要求、历史证据与计数不变。

## 当前框架入口 · 2026-10-20

当前派生实现以[Worktable AI工作台框架spec](../wayfinder/worktable-platform/framework-spec.md)为增量规格，[实现技术路线](../wayfinder/worktable-platform/technical-roadmap.md)与[交接](../wayfinder/worktable-platform/handoff.md)记录代码和后续缺口。首阶段11张工单已closed，完整spec仍open；不替代或自动关闭以下旧完整闭环规格。以下“尚未迁移/验收”的旧段落按其历史日期和版本读取。

<!-- native-compatible-plan -->
## 生效顺序

以当前完整闭环Spec的“当前生效边界”及用户最新指示为准：未经工作台补丁的原生DSH、rc.3插件适配在先、考公新SDK接入与历史保护随后推进。下列基础设计/接口文档保留参考；若包含新增原生插槽或内部编辑器接缝，不作为本轮实现依据。


返回 [进度入口](../STATUS.md)。

- [完整闭环Spec](../wayfinder/workbench-completion/spec.md)
- [路径图与决策](../wayfinder/workbench-completion/map.md)
- [应用平台基础规格](../wayfinder/application-platform/platform-spec.md)
- [应用接入与开发流程](../application-platform-extension.md)
- [工作台接口](../workbench-api.md)
- [工作台设计](../workbench-design.md)
- [插件UI风格](../plugin-ui-style.md)
- [安装与兼容说明](../workbench-install-compatibility.md)

阅读顺序：当前进度 → 完整闭环Spec → 路径图 → 对应工单。当前工作台适配在先、考公接入在后，原规格范围保持；新宿主和旧记录切换以升级决策及真实验收为前置。

## Worktable 基线框架规格

[基于 Worktable 的 AI 工作台框架与应用接入规格](../wayfinder/worktable-platform/framework-spec.md)：本轮已确认产品与架构的增量规格。主验收接缝已由用户确认，状态open、标签ready-for-agent；不替代原123项要求，不代表已经迁移或验收通过。
