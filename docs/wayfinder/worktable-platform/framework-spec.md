---
id: worktable-ai-framework-spec
title: 基于 Worktable 的 AI 工作台框架与应用接入规格
labels: [ready-for-agent]
status: open
assignee: null
testing_seam_confirmation: confirmed
decision_map: worktable-platform-map
upgrade_target: 0.2.1-rc.3
upgrade_status: implementing
upgrade_decision_map: harness-upgrade-map
upgrade_blocked_by: [harness-upgrade-acceptance-cutover]
---

## Problem Statement

用户需要一个以 AI 工作为中心的个人工作台，集中组织对话、任务、资料、工具与应用；后续既能在工作台内设计应用，也能直接开发应用后接入管理。现有两套实现各有所长：Worktable 的布局、窗格、标注、控制室和原生对话组织更贴近操作；现有平台具有数据展示、角色关联、任务上下文和能力复用，但维护两套窗口和搭建系统会造成重复、交互不一致及接入耦合。

如果不先定义应用、实例、视图、数据和原生会话的归属，新增应用会修改工作台内部逻辑，跨项目可能混用状态或历史；布局关闭、应用停用和业务数据删除也容易被混为一件事。用户要求先固定可演进框架，降低后续接入对现有能力的影响。

## Solution

以 Worktable 为代码基线，形成唯一的工作台前台。用户在项目中组合使用多个应用，既可以打开完整应用页面，也可以将应用提供的模块放入窗格。主动接入协议且声明状态能力的应用，其同一实例视图共享工作状态；不同项目的状态、任务和角色会话默认隔离；数据通过显式选择的资源引用共享，不复制整份资料。

应用复用不要求用户重复安装，也不要求直接开发的应用重写成配方。平台以少量明确接入契约管理应用、实例、视图、数据与任务，业务应用拥有自己的业务界面、规则、数据及私有能力。DSH继续提供原生对话、模型、轨迹、工具、审批和Stop。

首版优先证明稳定框架和真实接入，不把“自然语言生成任意业务系统”作为默认承诺。先固定受保护基线、验证一类独立网页和一类深度应用，再稳定接口并渐进迁移特色能力。

### 已确认的首阶段与后续阶段

用户在grill-with-docs首轮对四项边界全部确认。以下限定覆盖本文中未分阶段的概括描述，但不删除原用户故事、原123条要求或历史未完成项。

- 无项目时可直接使用原生对话和工具；后续关联项目不自动迁移旧会话或资料。实例选择的具体交互仍需原型验证，无项目实例及关联规则以下文已确认边界为准。
- 第一阶段必须完成：受保护基线和未经修改的宿主验证、网页和深度应用接入、深度应用同实例多视图状态共享、跨项目状态/任务/会话隔离、显式只读共享及受控写入、真实原生执行/问题/审批/Stop、基本标注已有体验保护、生命周期与刷新重启恢复，以及与该阶段接入相关的兼容/数据保护/升级回退验证。
- 后续阶段保留：完整应用搭建器与模板工作流、高级网页能力桥接、自动生成追改与相应迁移。不能以第一阶段完成关闭完整规格。具体后续功能尚未接入时明确显示不可用，不伪装为成功。
- 普通网页只保证入口、打开和布局，不保证跨域页面内部筛选、登录或业务状态同步；实例状态共享、数据联动和AI调用只适用于主动接入协议且声明对应能力的应用。
- 共享默认只读；写入另行授权，由数据所属应用执行。撤销阻止后续访问，不能删除已经进入原生会话的历史上下文。相关风险由实际权限及会话行为决定，不用界面隐藏代替授权。

验收F01至F08、F10至F13按首阶段实际能力执行；F09完整生成追改闭环及F14高级桥接调用安排在对应后续阶段。普通网页未授权原生访问的拒绝与反馈仍是首阶段底线，不能因高级桥接后移而放开。不同阶段都要求真实安装流程，后续项保留未验状态。

### 已确认的实例入口、授权范围与停用行为

- 在同项目再次点击应用，默认恢复最近使用实例；新建实例与添加同实例视图分别提供明确操作，不因重复点击创建新实例。没有可恢复实例时明确引导新建；最近实例缺失或不可用时显示原因，不擅自替换身份。
- 资源共享授权默认绑定选定实例，不绑定应用显示名、安装身份或全局当前项目；新的项目/实例不继承授权。允许用户显式共享同一资源给多个实例，仍由所属应用管理权限。
- 停用阻止新开实例与发起新任务，不自动取消既有任务；既有任务的原生会话查看、问题/审批与Stop路径保留。卸载前须明确处理运行任务，不能先撤销控制入口再让任务失去管理。具体界面入口待原型验证，保留这些行为约束。

### 已确认的无项目实例与升级边界

- 无项目时允许直接打开深度应用，以明确标记未归属项目的独立实例承载；不能暗中复用跨项目全局默认实例。后续用户可显式将该实例关联项目，不移动资料、不重建会话、不改变实例身份。
- 一个实例至多归属一个项目。跨项目复用的是应用定义和获准共享资源，而不是同一份工作实例；另一个项目需独立实例，不因关联而自动继承其他实例授权。
- 可验证、可回退的配置升级可自动执行；不可逆业务数据迁移必须先说明影响并由用户确认。不兼容时停止升级，保留原数据和恢复入口，不清空或倒灌旧整库。
- 配置变更、数据迁移和产品版本回退分别记录；回退产品不等于撤销已经执行的不可逆业务修改。实现者不能承诺未经验证的数据回滚。

### 2026-10-24 当前升级范围

用户已要求工作台适配新的 Harness，并将考公重新纳入新宿主及派生 Worktable SDK 接入。第一目标为官方未补丁 0.2.1-rc.3 / 22ddee3792402c3e70ec5f86a63c3e3e895a2f60，之后逐版验证；旧 alpha.2 仅保留冻结回退包，不要求新插件继续兼容。代码调整位于 my-dsh/plugins，原生源码、菜单、工作区、会话和执行机制保持。

原生构建 10/10 和页面启动已完成，仅作为环境事实；原生实例随后交由用户自行管理。Worktable 0.9.6 及考公 0.1.0 尚未通过 rc.3 完整适配验收，后续要求见[升级增量](#host-upgrade-requirements)和[当前工单映射](implementation/README.md#host-upgrade-followups)。

升级规则、旧学习归属、课堂公开嵌入原型与切换门槛仍在[升级决策地图](../harness-upgrade/map.md)中开放。本文 ready-for-agent 不代表这些未决增量已经可执行；未决项不得由实施者自行降级或决定数据迁移方式。

## User Stories

1. As a workbench user, I want AI work to remain the primary workflow, so that I can work without first designing an application.
2. As a user, I want one familiar layout and window system, so that I do not switch between duplicate workbench interfaces.
3. As a user, I want a project to combine multiple applications, so that related tools support one work goal.
4. As a user, I want to reuse an installed application across projects, so that I do not install or maintain copies.
5. As a user, I want project-specific application state, tasks and conversations, so that unrelated work does not mix.
6. As a user, I want to create a new application instance explicitly, so that an extra view does not accidentally create new work.
7. As a user, I want a full-page application view, so that existing applications remain usable without decomposition.
8. As a user, I want embeddable application modules, so that I can arrange several useful views together.
9. As a user, I want multiple views of one instance to share state, so that selection and progress remain consistent.
10. As a user, I want moving a view between panes to preserve its identity, so that layout changes do not change business context.
11. As a user, I want display-only modules without conversations, so that charts and lists do not create unnecessary AI sessions.
12. As a user, I want explicit data sharing, so that using one application does not reveal another project's records or conversations.
13. As a user, I want to reference shared source material, so that isolation does not duplicate my entire library.
14. As a user, I want AI task preparation to show its target and context, so that I can edit or cancel before sending.
15. As a user, I want module selection and filters included in prepared tasks when supported, so that the AI works on the intended records.
16. As a user, I want native conversation history, tools and trajectories, so that application work remains inspectable in DSH.
17. As a user, I want native questions, approvals and Stop to address the correct task, so that I retain control over execution.
18. As a user, I want closing or hiding a view to leave ongoing work intact, so that navigation does not silently cancel tasks.
19. As a user, I want to distinguish running, waiting, failed, cancelled and unread states, so that I do not mistake completion signals for success.
20. As a user, I want to reopen the same role conversation, so that view changes do not create duplicate sessions.
21. As a user, I want unavailable native capabilities explained with an actionable fallback, so that missing features are not silently substituted.
22. As a user, I want annotation requests associated with stable targets, so that layout movement does not redirect my request.
23. As a user, I want generated results attached to the correct instance and module, so that late results cannot overwrite replacement content.
24. As a user, I want reusable Agents and Skills without shared history, so that capability reuse does not mix private work.
25. As an application owner, I want to preserve application-private roles and Skills, so that integration does not forcibly promote them to global resources.
26. As a user, I want refresh and restart recovery, so that instances, task references and retained records remain usable.
27. As a user, I want storage failures and write conflicts explained, so that the interface does not falsely claim a successful save.
28. As a user, I want disabling or uninstalling an application to preserve business data by default, so that management is reversible.
29. As a user, I want upgrades and rollback to retain recent data, so that recovery does not restore an obsolete whole-profile snapshot.
30. As an application developer, I want to register an independently developed website, so that I can use the workbench without adopting a proprietary recipe format.
31. As an application developer, I want native plugin integration for deeper features, so that I can supply custom views, data and tasks.
32. As an application designer, I want composed applications to use the same registration and instance model, so that visual composition does not create a second runtime.
33. As an application developer, I want explicit instance and view context, so that I do not infer identity from the current global session or pane position.
34. As an application developer, I want registration, lifecycle and cleanup contracts, so that adding an application normally does not change the workbench core.
35. As an application developer, I want explicit capability and interface versions, so that incompatible applications fail clearly.
36. As an application developer, I want read and write access distinguished, so that a display integration does not gain arbitrary file or tool permissions.
37. As an application developer, I want optional platform styling and reusable controls, so that native modules and generated pages can look consistent.
38. As a user, I want third-party websites to preserve their own interface, so that the workbench does not inject global styles into unrelated applications.
39. As a maintainer, I want one DSH adaptation module, so that host compatibility changes do not spread across applications.
40. As a maintainer, I want one layout owner, so that applications do not compete to resize the native conversation.
41. As a maintainer, I want source and local modifications preserved before baseline selection, so that adopting Worktable does not discard user changes.
42. As a maintainer, I want documented upstream provenance and licensing, so that the derived plugin remains maintainable.
43. As a maintainer, I want application-specific teaching logic outside the generic contract, so that new applications are not coupled to Kaogong.
44. As a user, I want existing materials, scores, records, credentials and native history preserved, so that framework migration does not reset my work.
45. As a maintainer, I want real installed user-flow evidence, so that successful builds and mocks are not confused with usable integration.

46. As a user, I want an explicitly unassigned application instance, so that I can start working before creating a project.
47. As a user, I want explicit project association to preserve the instance and conversation identities, so that organizing work does not migrate files or reset history.
48. As a user, I want irreversible business-data migrations explained before confirmation, so that an application upgrade cannot silently make permanent changes.
49. As a user, I want incompatible upgrades to stop without clearing records, so that recovery does not hide data loss.

## Implementation Decisions

1. **代码组织。** 使用一个Worktable派生插件作为唯一前台；平台内核先以独立代码模块同包组织，不增加额外运行插件依赖。具体应用独立接入。原生DSH不修改，既有两套产品源代码与用户变更保留，按能力渐进迁入。
2. **四层职责。** 原生DSH拥有执行和会话能力；Worktable外壳拥有布局和工作环境；平台内核拥有应用/实例/视图关系及受控连接；应用拥有业务界面、规则与数据。跨层通过显式契约调用，业务应用不持有分栏引擎或任意原生全局上下文。
3. **基线保护是实施前置条件。** 本地上游包含大量已修改和未跟踪的源码、清单与编译产物。必须先清点、保存并核对精确快照及来源，保留许可证和本地修复，再固定实施基线。仓库HEAD不能代表当前工作树。禁止丢弃用户改动来获得“干净基线”。
4. **接入复用。** 优先利用已有项目卡片和布局声明插槽；新增应用/模块注册层补足缺口。已有项目插槽不是完整SDK，内部全局helper与封闭内容联合不作为公开接入协议。
5. **唯一布局所有者。** 保留一个分栏引擎。应用只提交视图和布局需求，不自行观察或重写原生页面布局。现有原生DOM锚定逻辑集中到DSH适配模块，并单独验证兼容与恢复。
6. **身份独立。** 区分项目、应用定义、应用实例、视图、页面、模块、角色、任务及数据资源身份。显示名、目录、窗格序号和当前全局会话都不能代替稳定身份。布局移动或重复打开视图不创建新实例；显式新建实例才分配独立上下文。
7. **应用实例与视图归属。** 一个项目可关联多个应用；同一应用定义跨项目复用。每个实例有单一状态所有者，多视图订阅同一所有者。视图释放、池淘汰和重新挂载不拥有删除业务状态的权限。具体选择器和导航样式留给交互验证，不作为身份推断机制。
8. **同会话编辑器。** 会话身份共享和编辑器挂载分开。一个原生会话的可编辑输入所有权需要显式仲裁；其他视图可以展示状态或导航到拥有者，不得重复创建Session来回避编辑器冲突。
9. **三类接入。** 轻量网页以完整页面接入，原生插件可提供深度视图/模块/数据/任务，组合应用使用同一注册和实例模型。网页不强制拆模块，深度应用不强制改成配方，组合应用不另建窗口和会话系统。
10. **最小注册契约。** 描述稳定应用身份、版本、接入类型、入口、可选视图/模块与能力需求；检查重复身份、不可用依赖和协议版本；明确注册更新和撤销行为。具体函数名与参数须经过薄接入验证后稳定，不能把本规格当作现有可调用接口。
11. **生命周期契约。** 分别定义打开实例、挂载视图、激活/隐藏、关闭视图、停止任务、停用应用、注销和卸载。关闭/隐藏视图不等于Stop、归档或删除会话；释放订阅和临时引用不删除耐久状态。停用/卸载涉及运行任务时须明确反馈和有序处理，不因卸载UI而丢失任务控制。
12. **原生能力契约。** 集中适配会话创建/关联/导航、任务发送、状态、问题、审批与Stop，沿用原生实际权限和执行机制。能力存在性由探测与实际验证决定，不由版本号猜测，也不创造原生尚未开放的能力。
13. **角色关联。** 现有稳定角色键和旧会话引用保护作为迁移行为基础；必须明确新项目/实例与旧键映射。读取、创建、重试、替换分别处理，重复/并发打开应收敛到一个绑定，替换须显式且保留旧历史。教学专用指令归应用适配，不能成为通用应用必选接口。
14. **能力复用。** 公共Agent/Skills保持独立管理来源；应用私有能力继续归应用。复用能力不授权读取其他实例历史。能力停用、缺失或调用条件不满足时给出明确反馈，禁止静默选择另一Agent或发送通道。
15. **任务与标注。** 准备任务时固定目标、来源视图/模块和有界上下文，允许编辑与放弃；显式发送后才进入原生执行。标注、生成请求与产物保留稳定归属，替换内容后到达的旧结果不得覆盖新目标。Stop、运行结束和未读标记不能作为业务成功证明。
16. **数据契约。** 应用声明数据源、作用范围、读取与可选变更动作；平台管理连接和显式授权引用。读写能力分开；实例共享同一资源不共享会话；同目录不等于同实例或已授权。现有数据目录不是共享授权系统，需要补足共享和撤销语义。
17. **网页能力。** 普通网页默认仅被打开，不获得原生上下文、凭据、文件和工具权限。跨域不可读或不允许嵌入须明确反馈并提供可行打开方式。需要平台能力的网页使用受控桥接，校验来源、发送窗口、实例、请求关联及能力范围；视图撤销后请求与迟到响应不能继续代表旧所有者。
18. **持久化分工。** 平台Host负责需要耐久保存的应用/实例关联和平台配置，布局及展示偏好可以留在浏览器，应用拥有业务记录，DSH拥有会话/轨迹/审批/附件。现有浏览器数据先识别与备份，再做有版本迁移，不直接清空或全局替换路径。状态格式、写入冲突与不可用存储要有显式反馈和恢复规则。
19. **版本演进。** 分开管理协议版本、应用版本、配置schema版本和数据版本。先探测兼容性，缺能力时明确阻止受影响操作。迁移失败保留原数据，回滚产品不倒灌过时整profile，支持恢复最近业务记录。框架不承诺未来接口零变化。
20. **表现与日常操作。** 保留Worktable布局优先、模块内配置、标注及原生对话连续感；AI工作是默认主流程，应用搭建和高级配置按需出现。平台提供颜色、间距、控件、状态、空态与错误态的复用契约；不通过全局CSS改写原生DSH或第三方网页。
21. **渐进迁移。** 先证明网页与深度应用两种接入及多视图/跨项目关系，再稳定第一版协议并迁入特色能力。旧前台、数据与原生状态保留至替代链通过；原123条要求逐项映射为保留、已迁移、待验或明确后续，不借新基线默删要求。

## Testing Decisions

**主验收接缝。** 以真实安装的派生插件中的完整用户流程为最高接缝。用户已明确回复“符合，按这个入口验收”；本规格据此在本地跟踪器发布为ready-for-agent。源码研究、模拟模型、退出码和DOM字符串均不能代替实际闭环。

**好测试的标准。** 观察用户能否完成操作、稳定身份/记录是否保持、未授权能力是否被拒绝、运行任务是否准确关联，以及错误是否可恢复。不断言私有字段、函数调用次数或特定DOM结构来镜像实现。优先通过公开注册、实例、数据和原生控制契约验证，对宿主DOM兼容的专项测试不作为业务应用协议。

| 编号 | 实际验证路径 | 必须观察到的外部结果 |
|---|---|---|
| F01 | 保存基线、独立构建、官方安装、打开工作台 | 精确来源与产物可追溯；用户修改、原生仓库和既有数据保持；布局和原生菜单可用 |
| F02 | 同项目接入网页和深度应用 | 两类应用可用，完整网页不被迫改配方；嵌入受限与能力缺失可解释 |
| F03 | 同实例打开两个视图，改变筛选/选择并移动窗格 | 状态共享、身份不变，不重复建会话；关闭/淘汰后能按声明恢复 |
| F04 | 两项目使用同一应用，新建和重复打开实例 | 默认状态、任务与角色会话隔离；重复/并发创建收敛，新建实例显式发生；未归属实例可用，明确关联项目后同身份且不自动移资料或重建会话 |
| F05 | 显式共享同一资料源并撤销共享 | 数据引用有效，不复制整库；未共享实例被拒绝；共享不泄露其他会话 |
| F06 | 准备、编辑、取消并发送AI任务 | 未发送前不调用模型；来源和目标正确；真实模型/工具在对应原生会话执行 |
| F07 | 原生问题、审批、轨迹和Stop，切换与关闭视图 | 实际交互指向正确会话；隐藏不误停；Stop真实生效且不误报成功；历史可追溯 |
| F08 | 同会话多视图及视图重新挂载 | 编辑器所有权明确，未发送文字不串位，不重复Session；原生能力缺口按记录反馈 |
| F09 | 标注、生成、追改、目标替换和迟到结果 | 正确目标可修改，旧结果不覆盖替换内容，原产物和归属证据保留 |
| F10 | 刷新、Host重启、浏览器重新打开 | 实例、角色关联、业务记录和资料保持；任务状态不伪造完成，故障可恢复 |
| F11 | 依赖停用、协议不兼容、存储失败和并发修改 | 明确阻止或提示，不静默重建身份、覆盖新数据或换Agent继续发送 |
| F12 | 应用升级失败、回退、停用、卸载与重装 | 原生、凭据、最近业务数据和历史保留；不可逆迁移有影响说明及确认，不兼容时保留原数据并停止升级，旧版本不破坏新数据，恢复链可复验 |
| F13 | 常用桌面/窄屏、主题、键盘、滚动及原生菜单 | 控件可见可操作，不裁切关键操作，不覆盖原生区域；生成页面遵守声明的主题契约 |
| F14 | 网页桥接的未授权调用、错误来源、已释放视图和迟到响应 | 不能获得未授予能力，旧请求不会作用到新实例；原生权限规则不被绕过 |

**辅助契约测试。** 覆盖注册冲突/撤销、版本检查、实例所有者、数据资源授权与取消、角色并发及替换、迁移失败、任务归属和清理。仅在权限/兼容/错误需要时使用可控夹具，夹具成功不计实页通过。

**既有先例。** 复用现有应用生命周期、角色绑定及恢复、展示状态、任务上下文、官方归档安装与保护清单的行为测试思路；复用Worktable输入桥接、会话适配、产物归属与分栏锚点回归思路。现有结果只属于原版本/原环境，不迁移为新组合的通过证据。

**证据要求。** 每项记录实际应用/协议/基线快照/宿主版本、操作路径、结果与限制；真实网页和深度应用不可仅由测试专用fixture替代。先前物理IME等人工证据保留版本范围，自动输入不冒充新的物理测试。新接入无法提供原生能力时记录受限流程，不通过修改原生补齐。

<a id="host-upgrade-requirements"></a>
## Harness 升级与考公接入增量（2026-10-24）

本段是本规格本轮升级要求的唯一详细入口。HU 编号是既有要求的版本化复验点，不重编号、删改或新增原 User Stories 的计数，不更改原123条、172条映射或历史验收分类。所有 HU 当前均未完成 rc.3 整体验收；独立适配切片的源码与点测进度见本轮实施图。

| 复验点 | 本轮必须满足的行为 | 关联原故事 |
| --- | --- | --- |
| HU01 版本与接口 | 固定宿主提交、版本及最终插件/SDK 包哈希；官方实际兼容检查、公开类型、接口行为与真实用户流程分开核验。支持声明需有对应版本证据，不能以通配 peer、自定义 compatibility 文案或版本豁免代替验证。已确认正式环境等待验收、未知版本仅在独立实例显式试用；不承诺未知版本自动兼容。 | 35、39、41、45、49 |
| HU02 原生角色身份 | 修正角色恢复对已移除 inspect 的依赖，使用目标宿主公开能力核验原 Session、preset、cwd 和工作区成员关系。明确缺失、迁移待处理、身份冲突、创建回执未知及返回不同 ID 的处理；不得静默重建老师或重试造成多会话。资料目录别名须验证，不能改写旧会话 cwd 来通过校验。 | 13、14、18—21、44 |
| HU03 输入与原生交互 | 覆盖纯文本、reference、command、quote及混合草稿的插入、焦点、撤销、中文输入与跨实例隔离。用户已确认标注改为开始标注时捕获的原生光标/选区末端插入，保留选中文字并可独立撤销，不再强制文档末尾追加。使用公开编辑器接缝，不写 Lexical 私有状态。完整原生对话、轨迹、问题/审批和 Stop 保留原生语义；准入、结束、未读或 Stop 不代表业务成功。 | 12、15、19—23、45 |
| HU04 生命周期 | 热替换、停用、卸载与重装释放自己注册的 HTTP/Upgrade 路由、监听、会话持有及能力；不能残留重复路由或失去任务控制。关闭视图不删除数据，刷新/重启保留身份，版本或存储失败明确可恢复。 | 24—29、34、49 |
| HU05 应用公开接入 | 考公通过公开 Worktable SDK 注册应用、实例、视图、资源、私有能力、角色及待发送任务，移除对旧 personal-workbench 运行时的依赖。旧角色当前/历史绑定接管及课堂嵌入需要补充公开合同或经用户确认的方案，不调用平台私有 attach、不手改 roles.v1.json、不复制原生消息冒充历史。 | 13、30—36、39、43、44 |
| HU06 考公状态归属 | 现有六个领域及 default 不是隔离实例；按已确认实例模型设计学习状态分区，同时覆盖 HTTP、原生工具和浏览器草稿。题库/来源资料与私有笔记分清，未知归属默认保留，不整库共享。已确认旧学习归入历史实例、新实例为空、原始资料库显式只读共享、笔记成绩与老师会话私有；具体映射须先预检；禁止给多个新实例接上同一份全局学习数据而声称隔离。 | 7、10、11、13、33、43、44 |
| HU07 真包与真实闭环 | 新版本冻结包经官方干净安装、客户端模块与公开消费者验证；Notes/Reading 同步新宿主验证，不直接放宽旧包声明。工作台实际创建/修改/启用、标注/生成、原生执行、恢复和授权撤销留证；考公实际角色、教学、练习评分、课堂完成、统计及资料引用连续可用，不用夹具、原型或目录可见替代。 | 19—29、35、37、44、45 |
| HU08 迁移与回退 | 正式数据切换前只读清单和影响预览不触发考公启动修复、recover 或 MinerU 写入。保留题目快照、评分/顺序、课堂完成证据、旧 Session/preset/cwd、资料链接及解析结果；本次适配不改答案、不重新评分。明确幂等接管、失败/未知恢复和版本/配置/业务数据各自回退边界，不能用旧整库覆盖迁移后新增记录。 | 29、44、48、49 |

### 研究依据与待决条件

- [原生公开接口研究](https://github.com/lvyangyan12q/my-dsh-plugins/blob/52757981818725d072e445523c670847511192c9/docs/wayfinder/harness-upgrade/research/harness-rc3-compatibility.md)分清声明拒绝与实际接口差异；提出的 stat/projections 或输入初始化替代尚未通过修复和实页验证，不视为已定函数签名。
- [考公迁移接缝研究](https://github.com/lvyangyan12q/my-dsh-plugins/blob/fc2614973552ad5db6178d03f791f4e27cf739b5/docs/wayfinder/harness-upgrade/research/kaogong-worktable-migration.md)确认全局/default、私有笔记和公开接管/嵌入缺口。用户已明确批准“历史学习实例 + 资料库实例”的归属方案，但具体正式迁移仍须预览确认；本轮未读取实际旧记录判断迁移是否可行。
- [升级规则](../harness-upgrade/issues/03-upgrade-policy.md)、[旧学习归属](../harness-upgrade/issues/04-kaogong-ownership.md)、[课堂原型](../harness-upgrade/issues/06-classroom-prototype.md)、[验收与切换](../harness-upgrade/issues/05-acceptance-cutover.md)中升级、归属和课堂路径已由用户明确确认并关闭，验收切换待落实。旧实例接管和 SDK 接口可按已确认归属实施；正式迁移仍需具体预览确认。

### 增量验收记录规则

所有历史 closed 与勾选继续限定在其原宿主、包版本和已测行为；不自动重开历史阶段，也不将其复制为 rc.3 通过。rc.3 原生环境准备已完成，插件/消费者/考公闭环仍待新证据。新包必须新版本，不能覆盖冻结包；普通网页仍无默认原生权限，跨实例只读分享与写入授权保持分开。

主验收入口继续是实际安装的完整用户流程，至少覆盖已有/冷/迁移待处理会话、混合输入草稿、并发角色创建、未知准入不重发、原生问题/审批/Stop、两个实例与同实例多视图、热卸载/重装/重启、旧记录接管及资料路径。Desktop、物理中文输入法或其他不能由当前环境证明的范围单列，不能沿用旧宿主证据冒充新版本通过。

## Out of Scope

- 修改原生DSH、替换原生源码或编译产物以解锁私有能力；本规格不授权切换3080或新建正式原生运行目录。
- 规格规划本身不执行部署、合并远程 PR 或发布。用户于 2026-10-24 调用 implement-spec 后，已按[独立适配实施图](../harness-upgrade/implementation/README.md)启动公开接口修复；未决的数据接管和交互门槛仍有效，正式切换不据此自动授权。
- 多人协作、租户系统、应用商店、云托管和商业化机制。
- 任意数据库/API的通用低代码构建器，以及一句话自动完成任意复杂业务系统的承诺。
- 自动改写任意跨域网页样式、绕过网页嵌入限制或默认授予网页原生权限。
- 新增考公课程、教学算法或无关业务扩展不属于本次版本适配；已有考公功能的接入、历史保护与学习闭环按本轮 HU 增量及原考公工单推进，不再以此前暂停排除。
- 本次重做全部现有特色功能；框架与薄接入优先，具体迁移保持逐项证据。

## Further Notes

### 决策来源与当前状态

本规格综合本轮已确认定位、代码基线、技术分层、应用双路径、项目组合应用、默认隔离/显式共享及多视图归属。它是新框架增量规格，不替代历史规格或原123项要求；源码实现状态、验收状态与用户确认分别记录。

用户此前允许阶段性采用同Session原生视图查看完整标题、从标注历史手动重新附加图片；两项原要求继续待上游公开能力，不在本规格中冒充已实现。用户随后优先考虑直接使用原有原生仓库，不以先前新目录提案视为本轮部署决定。

### 实施前的明确门槛

原框架阶段的保护与薄接入证据保留。本轮新宿主固定为官方 rc.3 / 22ddee3792，产品研究基线为 8b6fadd；后续实施须另外记录当时的精确源码与最终包。原生构建通过不解除 HU 增量的决策和真实验收门槛。既定项目/实例/布局关系沿用，课堂公开嵌入及历史接管按新决策票验证；技术签名尚待实现证明，不授权删除原有行为或绕过原生权限。

用户已确认真实安装的Worktable派生插件完整用户流程为主验收入口，接口测试仅作辅助。本文在本地跟踪器发布为ready-for-agent、状态open；ready表示可进入实施规划，不表示实现、部署或验收通过。

### 参考资产

- [决策地图](map.md)
- [领域术语](../../../GLOSSARY.md)
- [框架草案与源码约束](framework-draft.md)
- [Worktable扩展接缝研究](research/worktable-extension-seams.md)
- [现有平台能力迁入核对](research/current-platform-migration.md)
- [既有完整闭环规格](../workbench-completion/spec.md)


本轮最终代码审查基线：用户已确认 a81ac773fd2599744085ffd098cc32d3f4418e2c；不是上一轮的 485b38c 或 c44d9af。
