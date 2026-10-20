# 首阶段最终两轴审查

固定基线为用户明确确认的 `485b38cfd9a5d10de5a668ea4864246d4b1ebea7`；首轮终点 `5ee0e08d0f501fe9eb46ee7f18adb6684569ef2e`，修复及增量复审终点 `14e828d75be56463969b2eff72552ffc814c3273`。两轴由独立reviewer分别执行，以下保持各轴原结论，不把构建结果混同真实使用验收。

## Standards

首轮 **0项硬违规、1项P3启发式建议**。STD-01为可能的重复HTTP路由边界，独立reviewer后续明确接受保持代码：readRequestText与RequestLifetime已经共享正文读取、取消和排空机制；各路由准入/策略差异需要显式边界，强行整体抽象会掩盖安全和生命周期责任。该项accepted without code change，不是未处理的硬违规。

最终14e828d的6文件Notes权限/挂载测试/版本/文档增量独立复审无新增硬违规或actionable finding，Worktable运行代码无增量。最终 **0项待处理actionable问题**。[原始报告及followup](evidence/11-standards-review.json)。审查阅读了测试，未将其误记为该reviewer亲自重跑；相应独立复跑另由Spec记录。

## Spec

首轮 **1项P2**：Notes新草稿与编辑共同使用update权限，导致read+create授权无法新建、read+update错误提供新建。修复14e828d改为新草稿检查create、已有草稿检查update，归档按archive独立处理；Host授权和revision规则不放宽。

独立reviewer对四组真实mounted权限矩阵复跑 **4/4通过**，保留create-only/update-only/archive/readonly的控件及精确请求action负控；无真实grant、无profile扩权或Notes共享验收。followup状态resolved、最终 **0项待处理actionable问题**。[原始报告及followup](evidence/11-spec-review.json)。root另以最终Notes0.1.2实际owner新增/编辑/归档合成记录并恢复旧选择，不把owner流程当跨实例共享授权通过。

## 最终组合与验收边界

Worktable0.7.2 SHA256 `3b71dc04cb00675a372e687b04d25a7fd192c149f3eda0d2f2c0233f092aee42`，Notes0.1.2 `9c6e2424d4d5307d276c30ac0605266351130d7bdfcc230eef4bb7a36459c30c`，Reading `639c6964e471ba7e3c53e4d6ae14874eea63c77671087d36198190a9fd41ba41`。[E11实际记录](evidence/11-installed.json)区分最终安装、版本限定旧证据与辅助测试；[172条映射](11-acceptance-mapping.md)为66首阶段已验/94当前未验/12后续保留，不改变旧123条分类。

0.7真实菜单双向与稳定目标实页、0.7.1单视图窄屏、0.7.2焦点修复分别保留范围；最终0.7.2复验390px/原生切换、单composer及输入焦点不被resize抢走。标注移动/替换负控为实际installed回调/公开目标辅助证据，未声称实页边拖边编辑。Notes真实private+managed Skill模型执行发生于10的0.1.1组合；最终0.1.2仅权限显示增量和实际owner CRUD，不伪造最终版新模型调用。

额外Notes共享此前被自动审核在变更前拒绝并待具体许可；现用户已明确授权限定两条合成内容，实际只读引用及撤销补验见E11S，未对N1整实例建grant。完整failed/unread、真实磁盘故障、可选通用控件库、旧资料/考公迁移、不可逆业务迁移、未知未来不兼容升级继续未验；完整搭建器/F09自动追改/高级网页桥接后续。Windows浏览器桌面宽度与窄屏不代表原生桌面应用或macOS已验；旧未冻结014f候选只有digest说明、未留binary。11关闭仅是首阶段实施验收，不关闭完整framework spec。

回退沿[09生命周期与兼容回退指引](../09-lifecycle-protocol.md)，SDK锁定范围沿[10首版接入合同](10-sdk-contract.md)。schema2旧版拒绝与schema1显式恢复可逆门禁保留，不把旧整profile倒灌当回退。正式3080、原生运行目录切换及远程发布均未包含在本次授权。

## 2026-10-20 用户明确授权后的Notes限定共享补验

[E11S不可变补充实测](evidence/11-authorized-notes-sharing.json)，SHA256 `049f07b05df7d100a7feb9de49eab336f7e66b2f6449ea1bdbe95a3d6408839d`，记录此前pending转为用户明确授权后的实际操作。原[E11](evidence/11-installed.json)的SHA256仍为 `5a38cc46c9e5780aadd05f3f5f09b8293bb166bdfac1ea48dc277005f6b530cf`，原12实例冷启与当时授权待定事实不改写。

授权仅限N1原两条合成便签。N1另有一条归档测试记录，因此没有对N1整实例建grant；显式建立未归属合成来源N3 `c8ef612b-b90f-48d5-9aa0-5df5192d1238`，只复制经内容核对一致的原批准两条title/body，再由既有N2 `d8760a94-d344-4e51-a9a8-e4e970170327`引用N3。来源setup的显式复制与consumer不复制业务行是不同动作，不声称N1整实例或额外归档记录被授权。

grant `1ea40812-e906-4dcc-84fb-d83ee04b5b37` 仅read，rev1 active→rev2 revoked。N2完整页与同实例summary真实显示两条来源便签、只读禁写，写入HTTP403；撤销并显式刷新两视图均0条及撤销提示，不静默回退N2自有那一条。撤销后读/写403，精确owned3091冷启后API403且summary仍0及撤销提示。

N2自有业务revision前后精确为 `1:eaf037570b1116acc9c6fa269ff86a1404b2904bed9a6cabbfcdb1bdb32efebe`，旧note85110fac未复制或修改；N1原3条/active2保持，N3仅2条。roles、tasks及Reading两业务文件hash不变，原生输入10/1/0，不自动创建Session或模型请求。新增来源及两个视图是明确补验setup，后续inventory为13实例/15任务；原E11的12实例是此前真实版本证据，不能替换为13。

源包仍Worktable0.7.2+Notes0.1.2，未改代码、不可变E11或原两轴JSON。172条分类保持66/94/12，旧未验不提升；11继续closed，完整framework spec继续OPEN。没有扩大create/update/archive授权，没有N1整实例grant，不清理、不改正式3080或远端。
