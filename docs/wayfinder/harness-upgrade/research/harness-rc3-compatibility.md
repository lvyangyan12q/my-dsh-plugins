# Worktable 0.9.6 → Harness 0.2.1-rc.3 公开接口研究

地图 ID：`harness-upgrade-map`；研究票 ID：`harness-upgrade-native-research`。唯一主地图为 [docs/wayfinder/harness-upgrade/map.md](https://github.com/lvyangyan12q/my-dsh-plugins/blob/2ac6a9979cbd2ebf64705de5b6f00eb50d83e77b/docs/wayfinder/harness-upgrade/map.md)，研究票为 [01-native-compatibility.md](https://github.com/lvyangyan12q/my-dsh-plugins/blob/2ac6a9979cbd2ebf64705de5b6f00eb50d83e77b/docs/wayfinder/harness-upgrade/issues/01-native-compatibility.md)。地图/票读取主工作树，引用父流程已发布的地图提交；本分支不复制或修改它们。

研究日期：2026-10-24。产品固定父提交 `8b6faddefccbc339ddc9f09f706c880f451f89da`，分支 `research/harness-rc3-compatibility-20261024`；原生固定提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，版本 `0.2.1-rc.3`。术语沿用 root GLOSSARY：实例拥有业务上下文，多视图共享实例状态，窗格不拥有业务数据。

范围已定：rc.3 是首个适配目标，未来版本逐版验证；旧 alpha.2 仅保存冻结包回退，新包无须继续支持旧宿主。本报告研究适配接缝，不实施适配、迁移或部署。

## 结论

- **安装声明放行不等于可用。** rc.3 的实际检查读取 `engines.dsh`，缺省时读取全部 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer；不读取工作台自定义的 `dsh.compatibility`。对三份基线 manifest 执行官方纯函数，Worktable 放行，Notes/Reading 被旧 DSH peer 范围拒绝。[N1](#n1)[N2](#n2)[W1](#w1)[W2](#w2)
- **已确认的角色调用失配：** `role-native.mjs` 的 existing 校验仍调用 `sessionController.inspect(id)`；rc.3 SessionController 已无此方法。角色恢复、打开、校验已有绑定的路径需要适配，不能仅改版本范围。[W3](#w3)[N3](#n3)
- **公开能力足以继续做插件侧适配研究/实现。** retain/using、会话 prompt、原生导航、input scoped event、preset/skill 注册、domain storage 仍有公开入口。不能据此宣称工作台完整闭环通过。[N4–N13]
- 建议保留现有 `role-native` / `capability-native` / `sessionCompat` / `sessionDetails` / `hostInput` / `hostTransport` 接缝，收敛为可判定能力、可报告不可用原因的 rc.3 adapter；宿主实现细节不外泄到 Worktable SDK。[W3–W8]

## 声明兼容检查：已执行的有限验证

执行方式：Node 直接 import 原生 `packages/boot/app-boot/src/plugin-compatibility.ts`，读取三份包 manifest，调用 `evaluatePluginCompatibility(manifest, {}, '0.2.1-rc.3')`。没有启动 DSH，没有豁免，没有安装包或读取 profile。

| 包基线 | 官方检查实际结果 | 含义 |
| --- | --- | --- |
| `dsh-worktable@0.9.6` | `undefined`（声明通过） | 无 `engines.dsh`，两个 DSH peer 为 `*`；自定义 `dsh.compatibility` 只列旧版本，但不参与此门禁。 |
| `@deepseek-ai/dsh-project-notes@0.2.1` | 拒绝 `@deepseek-ai/dsh-storage-domain` 的 `0.2.0-rc.2 \|\| 0.2.1-alpha.2` | 是版本声明拒绝，不能推导为 domain API 已失配。 |
| `@deepseek-ai/dsh-reading-statistics@0.2.2` | 拒绝 `dsh-host-webserver`、`dsh-storage-domain` 的同一旧范围 | 同上；`optional` peer 不会在这套函数中免检。 |

检查使用 SemVer `includePrerelease: true`，`engines.dsh` 存在时完全决定 DSH 检查；Cordis/Schemastery peer 不属于这个检查的 DSH 名称集合，但仍是安装依赖和真实运行兼容性的另一个约束。启动 preflight 会禁用未获精确豁免的不兼容行，安装器也在写入前拒绝。[N1](#n1)[N2](#n2) 建议验证完成后用准确的 `engines.dsh` 声明首批已验证宿主，并同步依赖范围、旧兼容文案与发布检查；不得用 `*` 或豁免冒充验证。

## 接口调查与适配位置

| 面 | rc.3 接口所有者的实际公开入口 | 基线调用与判断 |
| --- | --- | --- |
| 配置 | Cordis `Config['~standard'].validate()`；Loader `loader/volatile-update`；settings `configure({auto}, ownerFiber)`。[N14](#n14) | Worktable 无 Host Config；Notes 已用 Schemastery Config、volatile 和 `settings.configure`，不是 Modlens 的 `settings.register`。自定义配置页仍须按真实页面测试。[W2](#w2)[W9](#w9) |
| Host/Client 注册 | Host `apply/inject`，包 `dsh.bundle.patch`、`dsh.client`、`exports['./client']`；Client lazy CJS `window.__ModuleLoader__.load({id,factory})`。[N15](#n15) | 工作台采用这些形式，未发现此层名称失配；需要最终包安装与工厂求值验证，不能用源码形式代替。[W1](#w1)[W10](#w10) |
| 会话持有 | Client `sessions.using/retain` 拥有代际引用；`scope/binding` 仅借用已持有代际，导航不归 sessions 所有。[N4](#n4) | `sessionCompat` 发送和 `sessionDetails` 模型读取已有 using；保留回调结束释放、单次发送选择，不在超时后换传输重发。[W4](#w4)[W5](#w5) |
| 原生发送/Stop | Client `SessionFace.prompt(content,'queue')`；Host `sessionController.prompt(request,signal)` 回 `{accepted:true}`，cancel 仅请求停止并保留队列。[N5](#n5)[N6](#n6) | task-host 的 prompt/flush/cancel 调用字段相符；`accepted` 仅为准入。`conversation.sendSession` 仍在实现类中，但不在 `IConversation` 公开类型中，adapter 应用 SessionFace.prompt，避免把实现存在当公开承诺。[W4](#w4)[W7](#w7)[N5](#n5) |
| 角色身份/目录 | Host create 可复用 blank；返回 ID 允许不同于请求 ID；`projections` 有 sequenced / migration-required / null；`sessionPersistence.stat(id)` 读取 header 而无须完整日志。[N3](#n3)[N6](#n6)[N7](#n7) | 必须替换已移除的 inspect；优先评估 stat.header.cwd + workspace membership + sequenced agentPreset，迁移状态显式不可用。创建的 ID 严格校验应保留，但需处理“已创建其他 ID/附着失败/回执丢失”，不自动替换旧绑定。[W3](#w3) |
| 原生导航/状态 | `uiWorkspace.openSession`；`uiSession.sessionStatus` 合并 running/pendingInteraction/completionUnread；list 的 retainedBy 只表本地持有。[N8](#n8)[N4](#n4) | `openHostSession` 和 snapshot adapter 方向相符；`mainView` 推断当前、提醒确认及冷会话计时仍须实测。停止和未读结束不能标成任务成功。[W4](#w4) |
| 输入 | `SessionInputResolver.for(scope)`、InputState、`slash/input-insert-text`、slot InputActions；检测坐标把 reference / command / quote 节点各压成一个单位。[N9](#n9) | `hostInput` 的 scoped event 路径存在；但只对 reference occurrences 折算末尾，未折算 command/quote，见下文。 |
| Agent/Skill | `agentPresets.register/resolve/acquireScope/compositionInventory`；`skills.register/snapshot/get`，provider、scope、invocation 仍明确。[N10](#n10)[N11](#n11) | capability-native / CapabilityDirectory 对应公开入口仍在。组合检查硬编码 `fiberState===2` 与本基线 `FiberState.ACTIVE` 数值相符，但应按枚举/固定 adapter 维护；没有运行私有能力、共享能力与作用域隔离验收。[W6](#w6) |
| 存储 | `storageDomain.open(spec)`，domain table get/put，调用者负责 close；非会话业务记录不是 SessionPersistence。[N12](#n12) | Notes/Reading 的自有 domain 调用未发现本次源码失配；工作台平台状态使用 profile 下自有文件，旧视图状态/媒体另有浏览器持久化。不能把升级宿主等同于迁移这些数据。[W7](#w7)[W9](#w9) |
| HTTP/生命周期 | `webServer.register/registerUpgrade` 返回 disposer，重复 route 抛错；`connection.admit(request)` 仍公开。[N13](#n13) | protectWorktableRoutes 的认证接缝可保留。Host index 的多条旧路由丢弃 disposer 是既有缺口：真实卸载/热替换后可能残留或重复；框架新路由和终端 upgrade 已有 effects。需在插件侧补齐生命周期，而非改宿主 register。[W7](#w7)[W10](#w10) |
| Web/Desktop 传输 | Client transport hook 仍有 `streamBaseUrl`，Desktop 提供 Host origin。[N16](#n16) | hostTransport 的 dsh-app WebSocket 路径未发现字段失配；本轮不作 Desktop 安装/运行兼容声明。[W8](#w8) |

## 两个必须纳入实现规格的具体差异

1. `role-native` existing 的 `inspect` 是确定的不存在方法调用；此处没有 feature guard。rc.3 可用 `sessionPersistence.stat()` 的 header 做 cwd 校验，`projections` 做 preset 校验；但 sequenced 与 migration-required 必须分支，后者只有缓存提示，不可据缓存判定绑定安全。已有会话 ID、cwd 和工作区成员关系须保留，失败时报告不可用，不能重建空会话。[W3](#w3)[N3](#n3)[N7](#n7)
2. `hostInput` 接受 `plain/claimed`，按 draft 长度加每个 reference 的 `1-length` 求末尾；rc.3 同时把 slash command 与 quote 压成一个检测单位，而 occurrences 只列 reference。源码可确定该折算覆盖不全；真实结果（拒绝、位置偏差或特定编辑器保护）未运行验证。优先评估公开 `requestDraftInitialization(binding,{prompt,whenDraftExists:'append'})` 是否满足追加语义及撤销要求；否则需要原生公开完整插入范围能力，不能回退直接改 Lexical 私有状态。[W4](#w4)[N9](#n9)

另外，SessionController create 对已存在且不可复用的请求 ID 可以新造 ID；工作台严格拒绝返回 ID 不同有保护作用，但这不能证明宿主没有创建副作用。报告建议后续为这一分支定义“结果未知/需核对”的接管行为，先不自动重试。`readSessionPreview` 使用 binding.eventSource，但原生把它注为 Conversation assembly 保留窗口；如要求可靠冷历史摘要，应评估公开 `session.page`，不可把当前窗口当完整历史。[W3](#w3)[W5](#w5)[N3](#n3)[N4](#n4)

## 消费者与第三方问题边界

Notes021 / Reading022 已在此前 rc.3 官方检查被跳过，是任务提供的现场事实；本轮纯函数结果复现了相应声明拒绝原因。不能用它们没有启动来证明 SDK 不兼容。解除声明阻断须在实际适配和验证后发布新包，不更改冻结包、不写豁免。

Notes 通过 `requireProtocol` 校验 SDK feature，再注册应用、私有 Skill、实例角色、自有数据资源和视图；Reading 注册实例视图/资源/角色，仍有可选 personalWorkbench 旧入口。[W2](#w2)[W9](#w9)[W11](#w11) 应随 SDK 验证：协议拒绝可读、同实例多视图一致、跨实例隔离、停用不删除历史、公共与私有能力归属、配置更新不换会话、资料授权与任务准备/发送/恢复。其自有 CRUD/domain close 要单独验证，不能被平台包构建替代。

BetterSidebar 等待 `webRuntime`、Modlens 调用不存在的 `settings.register` 是任务提供的第三方现场问题，本轮未检查其源码或运行实例。它们不属于 Worktable 适配实现范围；Modlens 的调用也不是当前 Notes 的调用。后续验收应明确插件集合，逐包归因，保留原生菜单、工作区、对话、轨迹、审批及 Stop。

## 建议的升级门禁与验收矩阵

| 门禁 | 要求与证据 |
| --- | --- |
| 固定输入 | 每次记录宿主版本/commit、Cordis/Schemastery 版本、插件和 SDK 最终包哈希；rc.3 首批，之后逐版重跑，不承诺未知版本。原生本基线 Node 要求 >=24.9.0。[N17](#n17) |
| 声明与类型 | 对最终 manifest 跑官方兼容函数；对当前公开类型编译 adapter 及 Notes/Reading 消费者；识别 Config/schema、返回 union 和缺失服务。官方检查不覆盖所有运行 API。 |
| 包与激活 | 最终 tgz 干净目录安装/import、Client factory 注册、Host/Client injection、缺能力的可读降级；热卸载/重载无残留路由、监听器、Skill、preset 或 owner lock。 |
| 原生交互 | 空/已有/冷/迁移待处理会话；精确角色 ID/cwd/preset/workspace；发送一次、断线或回执未知不重发；原生审批/问题/Stop/队列和轨迹保持原生语义。 |
| 输入/布局 | 纯文本、reference、slash claim、quote、混合、并发编辑、undo；hero/settling/active 及切换、展开/关闭分栏后菜单和原生对话可用。布局依赖 DOM 锚点，非稳定服务保证。[W12](#w12)[N18](#n18) |
| 状态与回退 | 多视图/多实例及 profile 隔离、重开恢复、自有 domain、浏览器状态和媒体；保留业务资产与旧会话身份。新宿主可能迁移会话格式，冻结旧插件包并不保证旧宿主能读取升级后的数据，回退方案须保留验证过的数据副本与宿主/profile组合。[N3](#n3)[N7](#n7) |
| 消费者 | 适配后新版 Notes/Reading 与 SDK 一起验收；独立记录 Desktop、Windows Web 的结果，其余平台未测就不声明。 |

## 已做与未做

已读固定工作台基线源码、地图/票和 GLOSSARY；原生 HEAD 用只读 `git rev-parse` 核实；30 份引用原生文件与固定提交逐一比较（仅归一换行）一致；执行一次官方兼容纯函数评估三份 manifest。没有改产品代码、原生源码、lib、profile、凭据或业务记录，没有启动/停止进程，没有运行 DSH、安装、构建、完整测试、浏览器或模型闭环。

此前官方构建 10/10 及原生页面启动通过仅作为任务输入，不是本报告重新执行的结果，更不是插件验收。输入坐标、角色修复替代、热卸载、真实安装、数据恢复、SDK 消费者闭环均未验证；这些必须成为后续实现规格与验收条件。本报告不关闭研究票，由父流程写 Resolution。

## 原始源码索引

下列 W 链接固定产品父提交，N 链接固定原生提交；地图/票固定父流程已发布的地图提交，避免把后续分支状态当作本次接口依据。

- <a id="w1"></a>W1：Worktable [package.json:10](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/package.json#L10)，同文件 37–58 行 bundle/client/自定义 compatibility、72–94 行 peers；[cordis.patch.yml:1](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/cordis.patch.yml#L1)。
- <a id="w2"></a>W2：Notes [package.json:36](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/project-notes/package.json#L36)、[index.ts:10](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/project-notes/src/index.ts#L10)；Reading [package.json:33](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/reading-statistics/package.json#L33)、[index.ts:8](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/reading-statistics/src/index.ts#L8)。
- <a id="w3"></a>W3：[role-native.mjs:4](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/role-native.mjs#L4)（7 行 inspect，10 行 create/flush）。
- <a id="w4"></a>W4：[sessionCompat.ts:8](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/sessionCompat.ts#L8)、[hostInput.ts:4](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/hostInput.ts#L4)。
- <a id="w5"></a>W5：[sessionDetails.ts:30](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/sessionDetails.ts#L30)（preview、preset/model API、create）。
- <a id="w6"></a>W6：[capability-native.mjs:3](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/capability-native.mjs#L3)、[capabilities.mjs:13](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/capabilities.mjs#L13)。
- <a id="w7"></a>W7：[task-host.mjs:9](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/task-host.mjs#L9)、[tasks.mjs:34](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/tasks.mjs#L34)、[host.mjs:15](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/host.mjs#L15)、[persistence.mjs:49](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/framework/persistence.mjs#L49)。
- <a id="w8"></a>W8：[hostTransport.ts:2](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/hostTransport.ts#L2)。
- <a id="w9"></a>W9：Notes [notes-host.ts:12](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/project-notes/src/notes-host.ts#L12)、[notes-settings.tsx:7](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/project-notes/src/notes-settings.tsx#L7)；Reading [reading-host.ts:20](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/reading-statistics/src/reading-host.ts#L20)。
- <a id="w10"></a>W10：[build.mjs:29](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/build.mjs#L29)、Host [index.ts:256](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/index.ts#L256)、Client [index.tsx:3211](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/index.tsx#L3211)。
- <a id="w11"></a>W11：[sdk.mjs:2](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/sdk.mjs#L2)、Notes [client.tsx:7](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/project-notes/src/client.tsx#L7)、Reading [client.tsx:20](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/reading-statistics/src/client.tsx#L20)。
- <a id="w12"></a>W12：[split.tsx:707](https://github.com/lvyangyan12q/my-dsh-plugins/blob/8b6faddefccbc339ddc9f09f706c880f451f89da/plugins/worktable/01_content/src/client/split.tsx#L707)（DOM 根选择与741行头部推断）。
- <a id="n1"></a>N1：[plugin-compatibility.ts:50](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/app-boot/src/plugin-compatibility.ts#L50)。
- <a id="n2"></a>N2：[compatibility-preflight.ts:93](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/app-boot/src/compatibility-preflight.ts#L93)；安装 [plugin-manager/src/index.ts:524](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/boot/plugin-manager/src/index.ts#L524)。
- <a id="n3"></a>N3：SessionController [index.ts:259](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/index.ts#L259)（公开方法表含create/list/page/follow/projections，不含inspect），迁移分支同文件538–561行；[agent.ts:342](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/agent.ts#L342)。
- <a id="n4"></a>N4：[contract/sessions.ts:47](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/client/contract/sessions.ts#L47)；[sessions/service.ts:126](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/client/sessions/service.ts#L126)。
- <a id="n5"></a>N5：[contract/session.ts:76](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/client/contract/session.ts#L76)；conversation [service.ts:40](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/service.ts#L40)（229行sendSession实现）。
- <a id="n6"></a>N6：[types.ts:258](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/types.ts#L258)（create返回身份、319行prompt请求与回执）；cancel [index.ts:498](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/index.ts#L498)。
- <a id="n7"></a>N7：[session-persistence/src/index.ts:48](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/session/session-persistence/src/index.ts#L48)（snapshot.header/formatStatus、187行flush、203行stat）。
- <a id="n8"></a>N8：[ui-workspace/client/navigation.ts:45](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-workspace/src/client/navigation.ts#L45)；[ui-session/client/index.ts:298](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-session/src/client/index.ts#L298)。
- <a id="n9"></a>N9：[contract/input.ts:221](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/contract/input.ts#L221)（初始化策略、258行InputActions、295行InputState，173行scoped事件）；[editor/projection.ts:85](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/input/editor/projection.ts#L85)。
- <a id="n10"></a>N10：[agent-preset-registry/src/index.ts:93](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/preset/agent-preset-registry/src/index.ts#L93)（register、389行acquireScope、403行inventory）；[composition-inventory.ts:20](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/preset/agent-preset-registry/src/composition-inventory.ts#L20)。
- <a id="n11"></a>N11：[skill/src/index.ts:94](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/skill/src/index.ts#L94)（registration及scope、439行register、471行list/snapshot）。
- <a id="n12"></a>N12：[storage-domain/src/index.ts:97](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/storage/storage-domain/src/index.ts#L97)（open和close所有权）。
- <a id="n13"></a>N13：[webserver/src/index.ts:438](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/host/webserver/src/index.ts#L438)；[connection/src/rpc.ts:240](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/connection/src/rpc.ts#L240)。
- <a id="n14"></a>N14：[fiber.ts:50](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/cordis/src/fiber.ts#L50)（Config；147行FiberState）；[Loader entry.ts:145](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/vendor/loader/src/config/entry.ts#L145)；[settings/src/index.ts:260](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/settings/settings/src/index.ts#L260)。
- <a id="n15"></a>N15：[modules/client/manifest.ts:1](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/modules/src/client/manifest.ts#L1)；[modules/src/index.ts:201](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/modules/src/index.ts#L201)。
- <a id="n16"></a>N16：[connection/client/index.ts:109](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/connection/src/client/index.ts#L109)；[desktop/main.ts:724](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/desktop/src/main.ts#L724)。
- <a id="n17"></a>N17：[package.json:3](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/package.json#L3)。
- <a id="n18"></a>N18：[ConversationMainPanel.tsx:45](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/client/ui-conversation/src/client/skeleton/ConversationMainPanel.tsx#L45)。
