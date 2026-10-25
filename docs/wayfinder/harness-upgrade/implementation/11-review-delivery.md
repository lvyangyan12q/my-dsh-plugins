---
id: harness-rc3-review-delivery
title: 固定基线两轴审查及准确交付
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-installed-acceptance]
acceptance_status: delivered-current-stock-source-scope
target: 0.2.1-rc.3
---

## Resolution · 已交付 · 2026-10-25

- [x] W.7/K.7准确归档、四入口回归及官方stock源码实页/冷恢复/同包重装验收通过，原生模式和应用私有角色边界保留。
- [x] 固定a81ac77→81fa66b两轴审查各0finding；正式profile注册、逐文件hash与其他配置保留通过。
- [x] 自有验收进程及页面关闭，3101/3080无listener；15个本轮工作树按nofollow断指针后安全清理，分支/归档/验收数据/资料保留。
- [x] 实际正常push至 `origin/codex/kaogong-rc3-completion` 并readback验证提交 `8cc9202040b0b016418f8ffe5b05295c7c9b7c12`。没有force、合并main或创建PR；本地工单按分支交付。

本票当前范围关闭。上述提交是已实际验证的远程交付点，本关闭文档提交将随后另行正常push，不自我引用未推送SHA。两次Schannel/HTTP408失败未改变远程ref，第三次仅per-command OpenSSL/HTTP1正常push成功，TLS验证保留且未改全局Git配置。

正式3080已注册但未启动，留给用户启动；正式旧资料只读清点未导入，历史会话/学习未迁删，09继续open并排除。正式资料具体预览/确认是范围外后续操作，不记为本轮未完成缺陷。

## 当前仅剩远程交付 · 2026-10-25

- [x] 准确W.7/K.7独立验收及正式注册，其他配置/数据保持。
- [x] 自有验收进程已验证后停止；3101及3080均无listener，仅自建3101浏览器tab关闭。
- [x] 本轮15个已合并工作树（含首次遗留孤儿及最终3个）按nofollow扫描、非递归断指针、零链接证明后安全清理。全部分支、永久/备份包、完整验收home及合成/原资料保留，旧阶段和其他scratch未清理。
- [x] 实际远程push成功并核验远程分支HEAD：`8cc9202040b0b016418f8ffe5b05295c7c9b7c12`。

11保持in-progress，仅远程交付待实际证明。正式3080未启动，资料接入仍需单独具体预览确认。

## 当前交付前沿 · 2026-10-25 · W.7 / K.7

20/13/10的stock默认启动及准确W.7/K.7同包重装实页已通过。正式profile已官方离线安装准确归档，9个W文件/65个K文件逐一hash相符；仅精确启用考公并设置已登记专用roleCwd及明确原资料根，根依赖总数前后均9（替换W/K两项、其余7项保持）/原12个bundle保留且安装后共13个bundle/patch/MinerU/题图路径深相等。正式3080未运行，正式资料未导入、历史未迁删。固定a81ac77→81fa66b两轴源码review各0finding，追加发布身份门禁未改产品行为。

本票保持in-progress，等待实际远程push证明与最后3个active自有工作树安全清理。已完成12个旧工作树nofollow断指针后清理；首次Windows清理事故、3个Native tracked文件精确恢复及2个官方编译库重建如实记录在[恢复证据](../../../evidence/2026-10-25/rc3-cleanup-recovery.json)，最终Native clean22ddee且K7 Host167/公开types通过，不能将其描述为从未触及Native。

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
