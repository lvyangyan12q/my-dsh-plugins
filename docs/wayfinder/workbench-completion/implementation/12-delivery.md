---
id: workbench-completion-delivery
title: 正式部署与远程交付
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-release]
followup_target: 0.2.1-rc.3
followup_status: pending-decisions
followup_blocked_by: [harness-upgrade-acceptance-cutover]
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-24）

状态保持 open；rc.3最终包真实隔离验收和数据保护通过后再确定正式切换；工作台阶段与含考公完整交付分别留证，未取得完整证据不得全量关单。

原工单范围、依赖和未完成验收保留，rc.3 具体增量依据[框架规格 HU07、HU08](../../worktable-platform/framework-spec.md#host-upgrade-requirements)。followup_status 为 pending-decisions，路线见[升级地图](../../harness-upgrade/map.md)，不因旧 ready-for-agent 标签自动执行未决迁移。

- [ ] 交付准确宿主/插件版本、归档哈希、配置差异、真实流程、资料/会话保护与明确回退步骤。
- [ ] 只同步插件及必要官方profile配置，不覆盖原生源码/lib，不重新生成旧根kaogong.cordis.yml。
- [ ] 遵守用户自行管理实例的最新指示，本次文档更新不启动/停止、安装或迁移正式数据。

历史检查仍是旧环境证据；以下原始业务标准不删除、不计为新宿主通过。


# 12: 正式部署与远程交付

**What to build:** 用户在正式 3080 使用与远程仓库一致的工作台，并可按说明启动及新增应用。

**Blocked by:** 11 · 兼容、升级与回滚验收。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 33；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 审查整个集成分支与用户确认基线，修复全部有效问题；父规格和原工单仅在完整对应验收通过后关闭。
- [ ] 隔离发布验收通过后同步正式插件，核对运行包来源/版本、保留原生菜单、开源 Worktable、Agent 改动与用户数据。
- [ ] 正式 3080 冒烟确认主要入口和接入应用可用，部署失败有已验证回滚路径。
- [ ] 最新实现和去隐私证据同步既有远程仓库/PR；本地、归档、正式运行和远程状态分别核对。
- [ ] 提供启动、应用搭建、数据/角色连接、升级与恢复说明；清理本次自建工作树而不动用户保留目录。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。


## 2026-10-11 用户确认：恢复原生、改为插件适配

正式交付仅安装/更新my-dsh插件和必要插件配置；禁止对原生仓库打补丁、替换原生lib或改变其菜单/编辑器。原生恢复先做完整变更与受影响编译产物备份；25个tracked修改恢复HEAD，两个本次新增composer源/测试移到备份，本地.dsh及kaogong.cordis.yml保留。原生重新构建后验证Git差异及不再含新增接口。插件完成无补丁适配并重新验收后才同步3080和远程。

本工单保持open。详细原生改动清单见[恢复与后续适配](../native-restoration.md)。考公专项暂缓，已有数据与历史证据保留。


## 2026-10-11 平台实页增量（分版本，不关单）

当前集成源码1ab23ed全三门禁0；固定基线 c44d9af 的审查结论继续继承，本次私有角色增量Spec/Standards两轴均无新增源码问题，继承固定基线审查。平台部分实页验收继续推进，并非12张全量完成。1ab自有alpha冷安装/恢复已核验，声明工具链卸载重装通过；正式等价21项 strict 错误、原生嵌入标题栏与未发送图片冷恢复限制均不得隐藏。没有本轮3080同步或远程发布完成声明；考公08/10暂停。[分版本实页证据](evidence/2026-10-11-unpatched-live.md#2026-10-11-平台收尾增量汇总)。


## 561实页增量（部分，不关单）

当前产品561fc228针对独立未补丁alpha原生d743三发布门禁均0，已在自有3089官方冷升级并启动；183归档产品文件、4521目标/4514来源保护项、28554原生项核对通过。实际桌面工作台填满原生中心1640×889，修复旧1ab收缩276px；原生菜单保留。 这是自有隔离实例，不是正式3080部署。全部123/12张依赖及未验边界保留，没有远程/正式同步。 [证据](evidence/2026-10-11-platform-561-live.md)。
