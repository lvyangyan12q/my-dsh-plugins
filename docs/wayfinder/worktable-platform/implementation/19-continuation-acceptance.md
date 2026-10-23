---
id: worktable-framework-19
title: 后续完整实页验收与交接
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [worktable-framework-12, worktable-framework-13, worktable-framework-14, worktable-framework-15, worktable-framework-16, worktable-framework-17, worktable-framework-18]
---

# 19: 后续完整实页验收与交接

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

以最终归档官方安装至独立DSH，完成上述用户流程、实际AI和恢复链；两轴审查并修复；更新逐项映射和交接，未验要求继续保留。通过后按既有授权同步3080插件与远程，保留回退包；不自动合入main或覆盖原生。

## Acceptance

- [x] 最终包实际安装与完整用户流程，按证据关闭各工单；版本/哈希/宿主/限制可追溯；无源码/夹具冒充实页，无扩大数据或模型授权。
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [x] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

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


最终0.9.4新增[UI补验](19-final-ui094.md)：Reading两视图及390px明暗/键盘/局部滚动，原生对话保留未发送标注与轨迹，A/B显示隔离，合作网页默认无权限。Editor只打开，未save、不算新建闭环；无模型重发。原alpha.2独立官方构建尚在准备，未记通过。19仍open待正式宿主前提和部署/交付。


## 0.9.6实际阶段补证

2026-10-23追加当前阶段：独立一致官方alpha.2/3093已安装冻结Worktable0.9.6、Notes0.2.1、Reading0.2.2。合成记录管理、多视图筛选详情及A/B实例/原生会话隔离已实际验证；Notes原生AI完成与另一轮native Stop、096冷恢复、最小宽度下问题一次提交及拒绝/允许一次审批均有实页证据。模型仅按授权复用连接，未混合实例会话。rc.2/3091最终三包冷恢复已实际复开旧未发送文字标注、7轮23步、甲G6与乙B1独立页面；Notes共享仍撤销，所选公开读取403，网页两准备任务仍无request。Chrome专有网页项目不在IAB本地布局中，不记跨浏览器布局恢复。19与完整spec保持OPEN、正式3080未同步；历史172分类不变、考公暂停。前述v1启动失隔离、正式cordis同字节重写、父仓库hook副作用、021peer失败历史继续保留；本段不将整项规格提升为完成。 见[实页阶段JSON](evidence/19-final-alpha2-installed096.json)。宽度补修按有限范围关闭，父19保持OPEN，其余全流程待验。


## 正式3080同步阶段（19仍OPEN）

2026-10-23正式交付检查点：用户选择的一致官方alpha.2构建已在3080使用原home和原数据，Worktable096/Notes021/Reading022正式同步，9/5/6文件与冻结包一致。目录可见两应用，创建的空Reading实例在刷新后经继续入口恢复同ID、无重复，无正式记录或AI请求。原Reading开发junction本体已归档、目标未动；第一次EPERM失败保留，正式重试通过。其余6依赖/lock解析、业务及3份根目录敏感文件哈希保留；原生UI只明确启用新Reading组件，策略恰一boolean变化。既有Modlens/BetterSidebar警告未禁用且不记通过。19仍OPEN待merger最终核验与远程交接，完整spec/历史172与考公等保留范围未改。 见[版本化正式记录](evidence/19-formal-delivery096.json)。本轮文档作者未安装、重启、推送或关闭19。


## 本后续阶段的四项AC核对（最终交付待核）

1. 12—18按各自已安装版本限定闭环留证；最终096、Notes021、Reading022和3080正式安装/有限UI可追溯，不等于历史172整体完成。
2. 公开接缝RED→GREEN、095原生问题裁切失败与096实际提交/审批成功均保留，不用源码镜像替代实页。
3. 版本/哈希/宿主/限制及失败记录齐全；当前只待merger最终核验、本批文档远程推送和最终交接后，按此后续限定范围关闭19。
4. 原生/上游/保护改动保持；正式123旧session/storage文件与3份根敏感文件哈希保持。3080仅在用户选择一致构建和保留原数据后作最终授权同步，Reading策略一处boolean为原生UI明确启用，不宣称策略逐字节未变。

完整framework spec仍OPEN；旧资料、考公、物理IME、桌面/macOS、内嵌原生标题栏与未发送图片等上游/后续范围单列保留，不能因这些保留项永久阻塞本后续阶段，也不能用本阶段关闭它们。


## 最终有限关闭

2026-10-23限定后续阶段交接完成：12—18限定实页、096两宿主恢复/原生控制及正式3080同步已留证，最终正式两轴审查无新增actionable finding，71cb0d9实现与交付证据已推送origin/codex/worktable-framework。工单19按continuation-spec范围关闭；完整framework spec继续OPEN，历史172的66/94/12及framework49的41/6/2分类不提升。考公、旧资料、物理IME、桌面/macOS、内嵌原生标题栏与未发送图片等上游/后续边界继续保留，既有第三方警告未被算为通过。原生源未补丁，正式原数据和选定一致运行时保留。 本段覆盖此前等待merger/push的阶段状态，不删除失败尝试或未验范围。两份最终正式审查及哈希见[交付证据](evidence/19-formal-delivery096.json)。PR可由root标记ready，不自动合入main。
