---
id: worktable-framework-19
title: 后续完整实页验收与交接
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-12, worktable-framework-13, worktable-framework-14, worktable-framework-15, worktable-framework-16, worktable-framework-17, worktable-framework-18]
---

# 19: 后续完整实页验收与交接

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

以最终归档官方安装至独立DSH，完成上述用户流程、实际AI和恢复链；两轴审查并修复；更新逐项映射和交接，未验要求继续保留。通过后按既有授权同步3080插件与远程，保留回退包；不自动合入main或覆盖原生。

## Acceptance

- [ ] 最终包实际安装与完整用户流程，按证据关闭各工单；版本/哈希/宿主/限制可追溯；无源码/夹具冒充实页，无扩大数据或模型授权。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [12](12-composed-authoring.md)
- [13](13-presentation.md)
- [14](14-inline-builder.md)
- [15](15-generation.md)
- [16](16-failure-states.md)
- [17](17-web-bridge.md)
- [18](18-upgrade-protection.md)


## 2026-10-23 interim installed checkpoint — remains open

[0.9.4实际阶段记录](evidence/19-final-interim-installed094.json) covers G6 explicit failure recovery and same-package official remove/add/cold UI restore, unchanged seven native requests and two prepared website tasks,9-file identity and selected durable-path preservation. Reading390px light/dark/keyboard/local-scroll evidence is actual0.9.3, not recast as0.9.4.

Fixed485b38c Standards/Spec review raised three findings; single implementer069a2fb corrected source, independently regressed18/18 with full272 source and10 factory checks. Source gates are separate from installed acceptance.19 stays open for final incremental mapping and delivery; formal3080 remains0.7.2. Original native alpha.2 baseline9 inactive entries and native UI failure predate this plugin and block alpha.2 UI acceptance; no native repair or rc.2 extrapolation. Historical172 mapping remains66/94/12, framework49 remains41/6/2.


2026-10-23新增[逐条增量映射](19-incremental-mapping.md)及[172条JSON](19-incremental-mapping.json)，保留历史原ID/原文/hash/分类及原文件SHA。实际、局部、未验与保留范围区分；不提升历史计数、不以Reading/合成迁移代替考公或真实资料迁移。19仍open，待正式宿主前提、3080同步和最终远程交付。
