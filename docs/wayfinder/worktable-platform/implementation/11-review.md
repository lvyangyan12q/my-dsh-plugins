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

额外Notes共享被自动审核在变更前拒绝，具体用户许可仍pending，未建grant或宣称通过。完整failed/unread、真实磁盘故障、可选通用控件库、旧资料/考公迁移、不可逆业务迁移、未知未来不兼容升级继续未验；完整搭建器/F09自动追改/高级网页桥接后续。Windows浏览器桌面宽度与窄屏不代表原生桌面应用或macOS已验；旧未冻结014f候选只有digest说明、未留binary。11关闭仅是首阶段实施验收，不关闭完整framework spec。

回退沿[09生命周期与兼容回退指引](../09-lifecycle-protocol.md)，SDK锁定范围沿[10首版接入合同](10-sdk-contract.md)。schema2旧版拒绝与schema1显式恢复可逆门禁保留，不把旧整profile倒灌当回退。正式3080、原生运行目录切换及远程发布均未包含在本次授权。
