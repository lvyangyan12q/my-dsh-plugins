---
id: harness-rc3-review-delivery
title: 固定基线两轴审查及准确交付
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: null
blocked_by: [harness-rc3-installed-acceptance]
acceptance_status: blocked-stock-default-source-entry
target: 0.2.1-rc.3
---

## 当前阻塞：官方默认源码启动 · 2026-10-25

先前准确W.7/K.6在显式 `TSX_TSCONFIG_PATH` 下的冷恢复、课堂、统计、重装与Native问题/Stop/审批矩阵证据继续成立，但未设置该变量、从Native目录使用官方原命令启动时仍可触发 `NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED`，因此本票恢复in-progress，禁止正式注册或将此前闭合解释为裸启动通过。

[20默认启动适配](20-default-source-startup.md)采用已声明公开get-tsconfig API仅提出配置候选，仍须实际activeTSX、安装范围映射及Native公共scope probe认可。源码已合入，新K.7必须通过干净官方离线安装及compiled/explicit-source/default-source/负例回归，并在官方stock入口实际复验；不要求用户加环境变量回避。本次没有改变Native、已验归档、正式配置或旧资料。

## 当前交付边界 · 2026-10-25 · W.7 / K.6

准确W.7/K.6已永久归档，固定a81ac77→edcdae2 Standards与Spec源码审查各0 finding，独立实页、同包重装后Native问题/Stop/审批拒绝与允许一次均通过，证据见当前脱敏记录。正式注册（启用考公并将roleCwd切至已登记专用工作区）、远程推送、获准范围清理仍待；正式原资料仅只读清点未导入，旧会话/学习迁移排除且09保持open。11不因源码、归档或独立实例通过而提前关闭。

[当前脱敏验收记录](../../../evidence/2026-10-25/rc3-fresh-installed-current.json)与[逐步接入说明](../../../worktable-integration.md)为当前入口；以下保留旧版本历史，不作当前状态。


按 implement-spec 完成最终 Standards/Spec 两轴审查，用户确认比较基线 a81ac773fd2599744085ffd098cc32d3f4418e2c。所有问题由单一修复实施者处理后复验。

- [ ] 准确记录 SDK/应用/Host 版本、归档 SHA、已验范围和上游公开能力缺口。
- [ ] 资料、原生仓库、用户七个已有改动与冻结资产保护复核。
- [ ] 文档提供逐步接入、影响、试用、升级和近期数据安全回退说明；旧历史状态不冒充本次通过。
- [ ] 在实际验收与既有授权边界内进行正式部署和远程交付，不自动合并 PR 或覆盖已发布资产。
- [ ] 清理本轮已合并可重建工作树，保留分支、证据及数据，按本地跟踪器关闭真正完成的票。

## 发布准备补记

依赖恢复的首次自动审批拒绝已被后续人类对具体操作的明确授权解除；精确恢复后326个依赖锚点及七个用户保护文件已核对。最终pack尚在执行，当前未据此宣称最终归档、注册或远程交付完成。独立验收实例已停止；10及本票保持open，等待最终产物与运行验收结果。
