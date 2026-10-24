---
id: harness-upgrade-map
title: 工作台与考公面向新 Harness 的兼容及迁移路线
labels: [wayfinder:map]
status: open
assignee: null
---

## Destination

明确工作台适配新 Harness、考公适配新 Harness 与派生 Worktable SDK 的技术路线、数据接管方式和真实验收/回退条件，形成可交给 to-spec 的共同决策。地图完成意味着路线清楚，不代表插件适配或正式交付完成。

## Notes

用户已确认：以当前 0.2.1-rc.3 为首个目标，并建立后续升级检查机制；旧 alpha.2 只保留冻结包回退，不要求新插件继续支持它。未来版本逐版验证，不能把“往后适配”写成自动兼容所有未知版本。

产品代码基线为 my-dsh 的 codex/worktable-framework / 8b6faddefccbc339ddc9f09f706c880f451f89da；原生基线为 D:/programming/workspace/deepseek-harness 的 22ddee3792402c3e70ec5f86a63c3e3e895a2f60 / 0.2.1-rc.3。原生已官方构建 10/10 并实际启动，随后本任务实例已按用户要求停止；用户自行启动状态不作推断，本轮不操作运行进程。

沿用既有定义：工作台是通用 AI 应用平台，考公是独立应用；同实例多视图共享业务状态，不同实例默认隔离，跨实例显式共享。保留原生菜单、工作区、对话、轨迹、审批、Stop；应用私有 Agent/Skill 保持归属，公共能力按配置复用。

规划和研究资产继续保留；用户已调用 implement-spec 推进实现。实现改在 my-dsh/plugins，不给原生源码或 lib 打补丁，不放宽检查绕过不兼容，不覆盖冻结资产。保留考公题库、成绩、练习/课堂记录、图片、讲义、MinerU 输出、旧会话身份与 cwd；不执行正式数据迁移或重启用户实例。

采用[本地 Markdown 跟踪器](../../agents/issue-tracker.md)。每轮参考 wayfinder；对话决策使用 grilling 和 domain-modeling，研究使用 research，确需交互原型才用 prototype。研究从独立 research 分支产出并推送，不合并、不创建 PR；地图只链接研究决策，不复制报告全文。除研究外每轮最多解决一个决策。

地图以 parent 查询子工单，blocked_by 引用真实本地 ID；仅 open、未认领且前置均 closed 的子工单属于可领取前沿。工单详情和 Resolution 是单一事实来源，当前前沿及依赖图见[操作入口](README.md)。旧 framework spec、历史要求及未验项继续有效，不据本地图自动关闭。

## Decisions so far

- [核实 rc.3 公开接口与工作台依赖的差异](issues/01-native-compatibility.md)：已分清声明门禁与实际接口差异，明确角色恢复、输入及生命周期的适配接缝。

- [核实考公旧接入、数据及角色会话的迁移接缝](issues/02-kaogong-migration.md)：确认 default 全局学习状态、私有笔记和旧绑定接管缺口，建议尚待用户决定。

## Not yet specified

研究若暴露既有实例、共享资源或原生角色身份模型无法表达的新关系，需要先辨清影响和可保留的历史，再形成新的决策票。目前不猜测具体新增关系，也不预设清库重建或自动归入某个项目。

若资料或历史记录出现现有备份与公开接口均无法恢复的情况，补救范围与所需证据要等问题被实际识别后才能命名；当前没有据此推定数据损坏或要求重新导入。

## Out of scope

本地图不执行适配、打包、迁移或部署；不补丁 Harness 或改其他第三方插件，不承诺新代码兼容旧 alpha.2，不重做工作台定位与视觉设计，不新增学习算法、修正题库答案、重建资料目录或删除历史链接。完整旧规格中的其他未完成项保留在原跟踪处，不借本轮重新分类为完成。


## 2026-10-24 已确认增量

- [升级规则](issues/03-upgrade-policy.md)：正式等待兼容验收，独立实例显式试用未知版本。
- [旧学习归属](issues/04-kaogong-ownership.md)：历史学习实例私有保留，新实例为空，原始资料库显式只读共享，正式接管先预览确认。
- 最终两轴代码审查基线固定为 a81ac773fd2599744085ffd098cc32d3f4418e2c。
- 课堂原型与验收切换两票仍开放；不能把上述确认写成课堂已通过或正式迁移已获准。

- [课堂原型](issues/06-classroom-prototype.md)：3098真实分栏/原身份/草稿/挂载已验证，用户确认学习模块左侧、原生会话右侧的公开接入路径；完整模型执行留给验收。
