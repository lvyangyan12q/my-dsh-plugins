# 当前工单

<!-- native-compatible-plan -->
## 当前执行基线

所有工单保持open。01/05先消除原生补丁依赖，02/03/04保留插件功能，06/07重新接入公开执行路径，09负责通用实页验收；11/12区分平台阶段与完整交付。08/10暂缓。详细顺序见[当前依赖](../wayfinder/workbench-completion/implementation/README.md)。


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
| 08 | [考公题目与资料完整性](../wayfinder/workbench-completion/implementation/08-materials.md) | 专项暂缓，已有结果保留 |
| 09 | [阅读统计通用应用闭环](../wayfinder/workbench-completion/implementation/09-reading.md) | 通用平台样例，继续验收 |
| 10 | [考公学习完整闭环](../wayfinder/workbench-completion/implementation/10-kaogong.md) | 专项暂缓，已有结果保留 |
| 11 | [兼容、升级与回滚](../wayfinder/workbench-completion/implementation/11-release.md) | 先完成平台阶段；完整范围仍待验收 |
| 12 | [正式部署与远程交付](../wayfinder/workbench-completion/implementation/12-delivery.md) | 平台验收后同步；完整交付仍待验收 |

本表表示当前优先级，未修改原工单状态或依赖；不能将平台阶段完成记成完整12张工单全部关闭。


最新：[原生恢复与适配调整](../wayfinder/workbench-completion/native-restoration.md)。01/05/06/11/12已记录原生改动、插件替代方向和重新验收要求。

[原生公开接缝盘点](../wayfinder/workbench-completion/native-public-seams.md)给出无补丁原生的可用公开接缝及每项补丁能力的替代/降级结论，是01/05/06适配的公共依据。
