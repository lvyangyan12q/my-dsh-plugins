---
id: worktable-framework-11
title: 首阶段完整验收与渐进迁移清单
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: acceptance
blocked_by: [worktable-framework-09, worktable-framework-10]
followup_target: 0.2.1-rc.3
followup_status: pending-decisions
followup_blocked_by: [harness-upgrade-acceptance-cutover]
---

# 11: 首阶段完整验收与渐进迁移清单

## 2026-10-24 rc.3 增量（尚未实施/复验）

原 status: closed 和原勾选仅对应历史宿主及已记录范围，继续保留；本节不是该历史阶段重新通过的证明。当前 followup_status 为 pending-decisions，依赖[升级决策](../../harness-upgrade/map.md)；不能仅凭旧 ready-for-agent 标签或原依赖已关闭领取新宿主增量。完整增量依据为[框架规格 HU01—HU08](../framework-spec.md#host-upgrade-requirements)。

- [ ] 为 rc.3 记录准确宿主提交、插件/消费者最终包和真实用户流程，历史映射不自动提升。
- [ ] 复验原生菜单、布局、标注/生成、授权、原生执行和冷恢复，保留已知未满足项。
- [ ] 将考公、旧记录与资料保护纳入新切换门槛；原型与研究不作为验收通过。

## 原阶段要求与证据

**What to build:** 在精确记录的官方安装组合上完成已确认F01-F08及F10-F13首阶段用户流程，不用测试夹具代替真实网页和深度应用。

**Blocked by:** [停用、升级与回退的数据保护](09-lifecycle.md)、[第二应用独立接入并冻结首版协议](10-protocol.md)。

**Status:** closed

- [x] 在精确记录的官方安装组合上完成已确认F01-F08及F10-F13首阶段用户流程，不用测试夹具代替真实网页和深度应用。
- [x] 完成桌面/窄屏、键盘、焦点、滚动、主题及原生菜单检查；普通网页未经授权不能取得平台能力。
- [x] 逐项映射原123条要求和本规格49条用户故事为首阶段已验、当前未验或后续保留，不删旧需求或假关旧工单。
- [x] 完整搭建器、高级网页桥接、自动追改继续列后续，首阶段通过不等于完整规格完成。
- [x] 记录未决兼容/原生能力限制、保护校验和回退指引；按固定基线进行Standards与Spec两轴审查并修复发现。
- [x] 只有实际证据齐全才关闭本阶段工单；正式3080、原生运行目录切换和远程发布不作为本工单的默示动作。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## 2026-10-20 领取最后实施前沿

09与10已完成真实验收、独立复审和精确批准保护合并；基于集成 `5a60f30ecaeb756f27743895cf2f9773b01777dc` 领取11，assignee acceptance。本次仅记录领取，以上验收项均未勾选，完整framework spec继续OPEN。

用户明确指定最终Standards/Spec两轴审查固定基线为 `485b38cfd9a5d10de5a668ea4864246d4b1ebea7`（本轮开始前），不采用旧c44基线。root实际发现的两项原生全局面板/项目导航缺陷纳入11修复，再完成最终UI与两轴审查，不提前宣称F13或全阶段通过。

额外Notes N1→N2共享操作此前被自动审核在变更前拒绝，当时用户具体授权仍pending、尚无grant，未操作；现用户已明确授权限定两条合成内容，实际只读引用及撤销补验见E11S。05 Reading共享/撤销与10自主owner-source接入的既有证据保持原范围。

领取前保护guard已核六个历史改动、干净index及native/upstream状态；本次仅修改本工单与README，不改代码、Host、正式3080或远端，不关闭任何验收项或完整规格。


## 实施记录：原生面板导航与基本文本标注

2026-10-20，独立工作树基于领取提交4c9f6ce。发现并修复：原生Plugins导航导致会话锚点消失时，分栏关闭订阅曾恢复旧会话覆盖全局面板；从全局面板打开项目又先依赖会话DOM而静默失败。0.7.0通过集中公开导航、关闭意图和可取消锚点等待修复，不修改原生或自动创建Session。

基本标注开始时固定可序列化项目/窗格/标签/内容身份，应用目标保留appId/instanceId/viewId；确认时按稳定身份重验，移动不重定向，替换/删除/切项目保留草稿并反馈。仍只填原生草稿，不发送或应用生成结果。

源码RED及最终包factory/真实React按钮回调门禁已补；实际3091组合、F13与标注人工路径、172项映射和两轴审查由root继续，本文不据构建或辅助回归关闭工单。


### F13窄屏补修（0.7.1，待真实实例复验）

root在真实500×844窗口发现工作台模块只剩60px宽；0.7实页菜单双向和稳定标注已过，但该F13缺陷仍阻断11。0.7.1在原生会话可用区域不足760px时改为单视图，选择框可切各模块与原生对话，各模块完整使用可用宽高。隐藏模块保活且inert；应用模式暂时隐藏/inert原生视图区，切对话、回桌面或退出恢复原style/inert及保留焦点。不会创建第二composer，也不改变草稿、会话、视图或业务身份，不重写桌面尺寸存档。

实际客户端factory/React门禁先对0.7窄屏失败，再验证444px完整模块、多模块选择、隐藏inert、原生对话显示及回桌面焦点/草稿恢复；它不能代替root真实DSH键盘/窄屏/主题检查。0.7原资产保持SHA030629…bf03，0.7.1使用独立版本与目录。


0.7.2独立复审修正：0.7.1实际390×844模块已全宽，但辅助实际factory发现resize回宽屏会无条件恢复旧原生焦点，抢走正在编辑模块的焦点。已加入永久RED并收敛为“原生呈现恢复始终执行；旧焦点仅neutral且未发生用户焦点转移时恢复”。模块/selector/按钮的新焦点使旧恢复资格失效，之后即使失焦也不会复活旧composer。0.7.1已安装资产保持，0.7.2独立版本；真实最终组合仍由root复验。


整体Spec审查P2修正（Notes0.1.2）：mounted权限矩阵先证明read+create被误禁新建、read+update被误开新建，再改为新草稿按create、已有草稿按update，归档按archive独立检查。四组真实挂载组件＋临时隔离资源fixture验证允许控件和精确请求action，不对真实profile创建共享授权。Host授权/revision规则与Worktable0.7.2运行字节保持；root实际安装复验与最终审查回执另记。

## 2026-10-20 最终首阶段验收（关闭11）

root已完成隔离3091最终官方安装与实际使用验收，精确实现 `14e828d75be56463969b2eff72552ffc814c3273` 已保护合入；Worktable0.7.2/Notes0.1.2/Reading三包锁定于[E11不可变实测记录](evidence/11-installed.json)，SHA256 `5a38cc46c9e5780aadd05f3f5f09b8293bb166bdfac1ea48dc277005f6b530cf`。本节补全上方历史“待验”检查点，而不抹去发现和修复过程。

最终390×844浏览器可用模块334px，模块/原生视图切换、单composer、hidden/inert恢复与选择/退出控件可见；明暗主题、Tab/ShiftTab/方向键、Enter退出、Esc关闭重开及应用/原生独立滚动实际通过。原生先focus→narrow点击Reading搜索→回1280仍为该搜索INPUT，旧native焦点不抢回；最终菜单与项目双向通过。截图保留[缺陷前](evidence/worktable-11-narrow-before.jpg)、[窄屏修复后](evidence/worktable-11-narrow-after.jpg)、[深色修复后](evidence/worktable-11-narrow-dark-after.jpg)；版本范围见E11，不将旧候选截图外推为所有最终行为。

基本标注实页选目标、编辑要求、追加原生草稿稳定ID通过，未发送模型；移动/替换拒绝保草稿由公开目标与installed React回调辅助验证，未声称实页边拖边编辑。普通网页实际内容保留sandbox/no-referrer，无凭据401、null-origin403。高级桥接及完整F09仍后续。

最终冷启动六平台文件逐一hash、Notes业务hash、实例/任务payload、角色Session及权限保持，12实例/15任务、原生输入10/1/0，无重放。N1完整页与summary均2 active且原selected恢复，Esc关闭重开保持；Reading4条/108分钟及旧未发送草稿不变。Notes0.1.2实际owner新增/编辑/归档合成note011776d0可恢复，保留旧两条active和选择，不冒称旧资料被零变更地删除或迁移。

[两轴审查](11-review.md)使用用户基线485b38c到14e828d：Standards首轮0hard/1P3启发式accepted-without-code-change；Spec首轮1P2修复后独立4/4 mounted矩阵通过，最终两轴0actionable。作者181/18零skip与独立包字节/回调检查是辅助，真实模型与提问/审批/Stop按07/09/10版本限定证据，不虚构最终组合再次执行。

[完整172条映射](11-acceptance-mapping.md)与[机器映射](11-acceptance-mapping.json)保留ID/原文/来源/hash/顺序，66首阶段已验、94当前未验、12后续。旧123分类不增加；考公/旧资料、不可逆迁移、未知升级等未验继续保留。额外Notes共享此前授权pending未建grant；现限定两条内容已明确授权补验见E11S，05 Reading主共享证据独立保留。Windows浏览器尺寸不外推原生桌面应用或macOS。

回退依[09指引](../09-lifecycle-protocol.md)，首版接口依[10 SDK](10-sdk-contract.md)。本次仅关闭首阶段11实施工单，完整framework-spec仍OPEN且未修改，旧工单不假关。六历史dirty、clean index及native/upstream经前后guard保护；未改正式3080、原生运行目录、远端，预览迁至C后的工作树清理由root另行安排，本次不清理。

## 2026-10-20 用户明确授权后的Notes限定共享补验

[E11S不可变补充实测](evidence/11-authorized-notes-sharing.json)，SHA256 `049f07b05df7d100a7feb9de49eab336f7e66b2f6449ea1bdbe95a3d6408839d`，记录此前pending转为用户明确授权后的实际操作。原[E11](evidence/11-installed.json)的SHA256仍为 `5a38cc46c9e5780aadd05f3f5f09b8293bb166bdfac1ea48dc277005f6b530cf`，原12实例冷启与当时授权待定事实不改写。

授权仅限N1原两条合成便签。N1另有一条归档测试记录，因此没有对N1整实例建grant；显式建立未归属合成来源N3 `c8ef612b-b90f-48d5-9aa0-5df5192d1238`，只复制经内容核对一致的原批准两条title/body，再由既有N2 `d8760a94-d344-4e51-a9a8-e4e970170327`引用N3。来源setup的显式复制与consumer不复制业务行是不同动作，不声称N1整实例或额外归档记录被授权。

grant `1ea40812-e906-4dcc-84fb-d83ee04b5b37` 仅read，rev1 active→rev2 revoked。N2完整页与同实例summary真实显示两条来源便签、只读禁写，写入HTTP403；撤销并显式刷新两视图均0条及撤销提示，不静默回退N2自有那一条。撤销后读/写403，精确owned3091冷启后API403且summary仍0及撤销提示。

N2自有业务revision前后精确为 `1:eaf037570b1116acc9c6fa269ff86a1404b2904bed9a6cabbfcdb1bdb32efebe`，旧note85110fac未复制或修改；N1原3条/active2保持，N3仅2条。roles、tasks及Reading两业务文件hash不变，原生输入10/1/0，不自动创建Session或模型请求。新增来源及两个视图是明确补验setup，后续inventory为13实例/15任务；原E11的12实例是此前真实版本证据，不能替换为13。

源包仍Worktable0.7.2+Notes0.1.2，未改代码、不可变E11或原两轴JSON。172条分类保持66/94/12，旧未验不提升；11继续closed，完整framework spec继续OPEN。没有扩大create/update/archive授权，没有N1整实例grant，不清理、不改正式3080或远端。
