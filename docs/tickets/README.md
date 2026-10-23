# 当前工单

## 2026-10-24 原工单升级要求已同步

[派生框架工单索引](../wayfinder/worktable-platform/implementation/README.md#host-upgrade-followups)已列 rc.3 增量与原票对应关系；原角色/执行/恢复/生命周期/SDK/验收/生成/失败/迁移/交接票增加未实施的 followup 及复验清单。旧考公资料、学习、发布和交付票也已更新范围，取消过期暂停描述。

历史01—19的closed仅适用于原限定验收，其中19索引已与最终关闭记录一致；旧完整闭环12张仍open。新宿主增量为pending-decisions，不改旧状态或勾选，也不自动发布新实施子票。当前前沿仍是[升级决策图](../wayfinder/harness-upgrade/README.md)。

## 当前实施结果 · 2026-10-20

[Worktable派生框架首阶段01—11](../wayfinder/worktable-platform/implementation/README.md)均已closed；完整framework spec继续open。最新[交接](../wayfinder/worktable-platform/handoff.md)与[后续待办/建议路线](../wayfinder/worktable-platform/technical-roadmap.md)已整理，建议尚未发布为新工单。

以下为旧personal-workbench完整闭环12张工单。其编号与新首阶段11张分属不同清单，原open/暂缓状态保留；“所有工单open”仅指该旧清单，不代表新阶段未实施。逐条完成范围以[172项验收映射](../wayfinder/worktable-platform/implementation/11-acceptance-mapping.md)为准。

<!-- native-compatible-plan -->
## 当前执行基线

以下旧完整闭环12张保持open，不包含派生框架01—19的历史关闭。考公08/10已恢复接入与保护规划，正式实施仍等待升级、旧学习接管和课堂验证；其他原依赖不删除。当前rc.3增量以派生索引和升级决策为准，不能按本页旧标签直接迁移或部署。


返回 [进度入口](../STATUS.md)。[原工单清单与依赖](../wayfinder/workbench-completion/implementation/README.md)保持原始完整范围。

| 编号 | 工单 | 当前阶段 |
|---|---|---|
| 01 | [平台入口与窗口恢复](../wayfinder/workbench-completion/implementation/01-runtime.md) | 平台优先，待完成验收 |
| 02 | [手动创建完整应用](../wayfinder/workbench-completion/implementation/02-authoring.md) | 平台优先，待完成验收 |
| 03 | [数据展示与模块联动](../wayfinder/workbench-completion/implementation/03-data.md) | 平台优先，待完成验收 |
| 04 | [能力复用与角色绑定](../wayfinder/workbench-completion/implementation/04-roles.md) | 平台优先，待完成验收 |
| 05 | [DSH原生执行闭环](../wayfinder/workbench-completion/implementation/05-native.md) | 平台优先，待完成验收 |
| 06 | [画布标注与模块生成](../wayfinder/workbench-completion/implementation/06-annotation.md) | 平台优先，待完成验收 |
| 07 | [AI创建应用闭环](../wayfinder/workbench-completion/implementation/07-generation.md) | 平台优先，待完成验收 |
| 08 | [考公题目与资料完整性](../wayfinder/workbench-completion/implementation/08-materials.md) | 已恢复接入/保护规划；新宿主验收待前置 |
| 09 | [阅读统计通用应用闭环](../wayfinder/workbench-completion/implementation/09-reading.md) | 通用平台样例，继续验收 |
| 10 | [考公学习完整闭环](../wayfinder/workbench-completion/implementation/10-kaogong.md) | 已恢复接入/保护规划；新宿主验收待前置 |
| 11 | [兼容、升级与回滚](../wayfinder/workbench-completion/implementation/11-release.md) | 先完成平台阶段；完整范围仍待验收 |
| 12 | [正式部署与远程交付](../wayfinder/workbench-completion/implementation/12-delivery.md) | 平台验收后同步；完整交付仍待验收 |

本表表示当前优先级，未修改原工单状态或依赖；不能将平台阶段完成记成完整12张工单全部关闭。


最新：[原生恢复与适配调整](../wayfinder/workbench-completion/native-restoration.md)。01/05/06/11/12已记录原生改动、插件替代方向和重新验收要求。

[原生公开接缝盘点](../wayfinder/workbench-completion/native-public-seams.md)给出无补丁原生的可用公开接缝及每项补丁能力的替代/降级结论，是01/05/06适配的公共依据。

## Worktable基线首阶段（2026-10-18）

当前新实施入口为[Worktable AI工作台首阶段11张工单](../wayfinder/worktable-platform/implementation/README.md)，对应已确认框架规格与阶段边界。先行基线保护和交互原型可并行，后续按实际阻塞边领取；本页此前工单保留历史范围及状态，不与新编号混用。
