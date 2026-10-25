---
id: harness-rc3-kaogong-role-scope
title: 考公全新部署的应用私有角色与Skill
parent: harness-rc3-kaogong-instances
labels: [ready-for-agent]
status: in-progress
implementation_status: production-source-integrated
acceptance_status: blocked-installed-role-persona-collision
assignee: kaogong-roles-scope
blocked_by: [harness-rc3-worktable-freeze]
target: 0.2.1-rc.3
---

## 最新真实安装结果 · 2026-10-25

独立3101已安装准确 Worktable `0.10.0-rc.3.4` / Kaogong `0.2.0-rc.3.2` 候选，原生模式选择器实际仅显示宿主标准模式，未出现考公班主任、辅导员或任课老师条目，这一菜单边界通过。

**候选未通过角色验收**：首次点击创建班主任时，真实组合运行报 `duplicate deployment:persona-prefix`，角色没有完成创建。源码/类型测试未覆盖这一安装后的原生人格组合冲突，修复仍在独立源码切片处理中；当前归档不能因此视为可交付。真实模型请求为0次，角色人格、私有Skill、教学/问题/审批/Stop及冷启动恢复均未完成实际验收，本票保持in-progress。

3101仅停止了本轮自有进程，合成实例及回执保留供新候选复验；没有注册到正式环境、推送完成声明或修改正式资料。

# 当前范围：全新部署 · 2026-10-25

用户最新指示为“**不用管历史的会话，全新的部署安装就可以，但是之前的资料需要保存**”。本轮据此采用新的应用角色和学习实例，不实施旧Session的A/B交接，不再等待该历史交接路线确认。以下历史提案继续保留以解释之前的研究，不能作为已批准或正在执行的迁移方案。

## 本票实现边界

- 新学习实例从空状态开始。班主任、辅导员、任课老师是应用私有角色，复用已有通用Native Agent，以可信Session到应用实例/角色的绑定，在该Agent自己的公开作用域挂载系统人格和教学Skill；不为新角色注册全局专用模式，不把人格混作首条user消息。
- 新角色创建、并发收敛、普通原生直接聊天、任务、课堂和练习都核对同一可信身份；私有Skill仍在角色声明及实际scope中接受校验，不能删声明绕过门禁。未绑定Agent和其他实例不获得该人格、Skill或资料权限。
- 本轮不创建旧模式兼容注册以承接旧Session。旧Native会话、其原preset/cwd/日志和旧学习记录均不迁移、不改写、不删除；新部署不以旧会话继续执行或旧记录接管作为验收前置。不承诺从新部署继续旧Agent；用户要求的是原件保存，不是历史会话续用。
- 旧题库、讲义、图片、PDF和MinerU产物的原址及读取关系由[15资料保留与接入](15-kaogong-fresh-materials.md)清点。新学习实例不加载旧成绩、错题、课堂状态或老师历史；资料是否可供新实例读取，必须以明确的资料范围及只读授权处理。
- [14占用预检](14-kaogong-adoption-preflight.md)已合入的保护继续保留，但历史Session接管不是本轮新部署前置。不得据本范围变化删除unknown接管回执或解除其隔离。

## 当前待办与验收

- [x] 生产公开SDK作用域与考公接线已合入；真实Native服务的Host回归通过，新归档及真实模型实页仍待验。
- [ ] 新部署菜单不出现考公专用模式，应用内可显式创建并继续各私有角色。
- [ ] 真实模型普通对话及课堂、私有Skill激活、同实例多视图、跨实例拒绝、原生问题/审批/Stop和刷新重启留证。
- [ ] 缺失、停用或owner撤销不静默改用其他角色；释放作用域不删除业务记录或会话原件。
- [ ] 新归档与实际安装验证，准确声明新SDK能力和版本，不覆盖已冻结Worktable `.3`或考公 `.1`。

资料接入若写入新资料库目标，先给出materials-only具体影响预览并确认对应计划，见15。本轮不再请求旧Session A/B路线或逐会话交接执行确认；将来若另行恢复历史迁移需求，须重新定义范围及具体授权。

## 生产源码切片 · 2026-10-25

实现 `95702a5` 经集成合并 `c57205caba30fb9249b548dc209ad56832002eff`。新增Host-only `contributeSessionScopes`，以 `native-role-session-scope-v1` 明确准入；创建前在独立可释放scope校验角色Skill，`agent/created` 按持久intent/ready身份挂载应用persona与私有Skill，`agent/pre-step` 复验归属和当前scope。停用或撤销后拒绝继续该应用角色，不回退通用执行；无归属Agent不因目录相同而获得教学Skill。

考公新角色使用已存在的 `standard`，安装官方persona、filesystem Skill、Skill工具和提问插件到已核验的原生Agent Context，不注册各角色的全局preset。新增精确rc.3 `dsh-scope` 运行依赖；旧会话和资料没有迁移、改写或删除，旧绑定与新声明不符时明确拒绝自动接管。

合并后的真实公开Native服务Host回归148/148通过，核心SDK/能力/角色公开合同32/32通过。额外旧rc.2组合检查4项中2通过、2旧环境跳过，跳过不作本版通过证据。测试使用真实注册器、系统persona及Skill作用域，但没有模型调用或最终归档安装；不能据此关闭菜单实页、普通聊天、教学、刷新重启或完整生命周期验收。新Worktable候选版本和考公包必须声明新增feature及精确依赖，不覆盖冻结Worktable `.3`和考公 `.1`。

### Worktable新候选归档（未作真实模型验收）

版本 `0.10.0-rc.3.4` 的候选metadata提交为 `1411411`，实际pack检出为 `56f99f041172e355fd336406d062806a48c892eb`；集成版本合并为 `e3e61a123dc9163d907cfb4f97ce3f0ea1b19d4a`。使用规定 `01_content/npm run pack` 完整通过，源码351项中349通过、0失败、2项旧rc.2环境跳过；固定官方rc.3合同9/9、精确9文件、独立安装/import、SDK及全部安装产物门禁通过。没有用这些门禁代替3101真实普通聊天/教学或新考公组合包验收。

两份候选 `dsh-worktable.tgz` 与 `dsh-worktable-0.10.0-rc.3.4.tgz` 各579047字节，SHA256均为 `8b642e2dd1b29ecce6c8c572e34e0b452e6d405975cad943e7d41a631e983b73`，已永久保存在 `plugins/worktable/01_content/dist/v0.10.0-rc.3.4/`。复制时逐一核对来源与目标字节，已有不同哈希资产拒绝覆盖。旧Worktable `.3` 与考公 `.1` 冻结包保持，13继续in-progress；本次合并没有正式注册、资料接入、数据迁移或远程推送。

## 历史提案：已被上述全新部署范围替代（superseded）

以下内容是用户改为全新部署之前的只读研究和未实施方案。原文保留，不作为本轮前置、不等待确认、不据此改变任何原会话或学习记录。

<details>
<summary>展开已被新部署范围替代的历史A/B交接提案</summary>

# 主方案（待确认，未执行）

用户要求考公班主任、辅导员、任课老师作为应用私有角色/Skills，并明确选择“旧条目也必须消失，先出历史会话迁移方案”。本票提出实现路径；选择这一方向不等于已批准具体旧会话、课堂或任务的迁移。没有撤销旧注册、修改预设ID、替换会话或迁移数据。

**新会话**复用宿主已存在的通用原生Agent（候选`standard`），通过可信Session与应用实例/角色绑定，在该Agent自己的公开`agent.ctx`挂载系统人格和内置教学Skill；不为各角色新增全局模式，不把人格混作首条user消息。

**旧会话分两类逐条处理：**

| 类型 | 候选操作 | 保持与变化 |
| --- | --- | --- |
| A：真正从未开始turn | 用户确认后，公开`agentPresets.select`切到通用预设；重新核对空白状态，flush后冷恢复复验 | Session ID、原目录保留；当前preset选择改变，原创建元数据仍保留。若确认后已有turn导致locked，停止该项，不能自动改走B |
| B：曾开始turn，或已有历史 | 用户确认后新建generic角色会话承接未来任务；旧Session作为可查看的历史原址保留 | 当前角色的active Session ID和preset改变；原Session ID、原preset、cwd及日志原件保留，不复制整段旧对话伪装同一Session |

对不能证明空白、身份、归属、格式或任务状态的会话，一律暂不切换。撤出全部旧菜单声明须等所有相关会话已逐项处置且重新启动核验；不能只迁移业务roles索引中能看到的记录。

## 需要用户明确接受的约束变化

1. 旧要求“同一角色始终使用同一Session”的继续执行部分，在B类会话改为“原Session只保留历史查看，新Session承接未来”。过去的评分、课堂完成证据与原始资料不因此重算。
2. A类不改Session ID，但当前AgentPreset选择会改变。B类新增ID并改变角色当前绑定；原preset ID不改写、不重命名为通用预设。
3. 旧会话不再作为考公当前执行入口；应用工具拒绝旧历史身份的写入。**不承诺原生界面的输入框能隐藏或被插件改成强只读。**旧模式撤出后，直接尝试继续旧Agent可能被原生报“预设不可用”；这与原始历史仍可查看是不同能力。
4. 旧未发送草稿不自动搬入新会话，也不自动发送。文字和引用供用户核对后选择重新整理；图片按已确认上游能力边界手动重新附加，不声称能自动恢复未发送图片。
5. 迁移中的课堂/任务可能需要暂停、重新准备或明确交接。用户的技术路线确认与具体source/target ID、revision、fingerprint及影响预览的执行确认分开。

## 为什么不能一律原地改预设

目标是官方未经补丁的Harness `0.2.1-rc.3` / `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。

- `PresetDefinition`只有`id/name/description/order/plugins`，没有公开的hidden/selectable/application-only属性。`agentPresets.list()`返回每个注册声明；Native模式选择器消费这份roster。私有的能力执行scope不会使注册声明从全局列表消失。
- `agentPresets.select`在`openTurnStartSeq !== null`或`lastTurn > 0`时抛`agent-preset/locked`。没有支持历史会话强制改preset的公开参数。
- `recompose`虽可调用，但其契约明确是blank Agent、由调用者负责空白校验。不能绕过select锁、手写preset选择日志或改磁盘header来假装兼容迁移。
- 注销旧声明会使后续`resolve/acquireScope`失败；已持有的旧generation仍可能活着。因而“从菜单消失”不能被误写为“所有旧Agent已停止且能以新角色继续”。

## 只读清点和具体预览

实施前生成本机私有清单与脱敏摘要；不在公共仓库发布会话正文、用户路径或真实资料。

必须同时覆盖：

- 已被Worktable当前/历史绑定引用的考公角色；`current Session`、`previousSessionIds`与逐条历史身份，不仅统计当前9种角色。
- 尚未接管的旧`legacy-default`与旧roles记录，包括创建intent和未知结果。
- 宿主所有持久Session中引用考公自有旧preset的记录；覆盖业务索引没有登记的、原生直接创建的会话。只读公共stat/projections/目录契约核对，不能猜ID、读到一份旧角色表就当全量。
- 全局新会话默认预设、用户配置/第三方插件中的同名声明与引用。只撤出考公插件自身拥有的注册ID/provider；若personal-workbench、用户Cordis配置或其他插件仍贡献相同ID，列清来源与配置影响，不能擅删其他插件或内置通用模式。

每条预览至少列：所属实例/角色/subject；旧当前及历史Session IDs、真实preset和cwd/工作区成员；formatStatus和turn事实；A/B/blocked分类；运行/问题/审批/排队/草稿状态；相关课堂和任务；候选target ID（B）或target preset（A）；源revision和固定fingerprint；需改变的绑定；只读历史入口；失败恢复步骤。任何源状态变化都使旧预览失效。

## 执行顺序与拒绝条件

1. **预备校验。**确认通用preset真实存在、能激活所需工具/提问/Skill；确认新私有作用域模块已经通过同实例、多实例、普通原生直接聊天和重启测试。原型成功不替代此门禁。
2. **收敛在途执行。**先建立持久迁移屏障，阻止该角色新任务提交、并发创建/替换及旧Agent新执行；现有角色replace与任务不共享同一事务，不能靠各自gate宣称原子切换。逐条核对实际Agent、已接受原生请求、问题/审批、队列和未知准入。任何running/waiting/unknown/未决审批都阻止对应角色切换。用户可以先处理或明确Stop；Stop不表示回滚已发生写入，队列不自动清空、转移或重发。退出后重新预览。
3. **固定交接计划。**只有源事实、owner、课堂/任务处置及target都明确的具体计划可请求执行确认。新旧角色映射不明、跨实例已占用、重复来源、旧格式待迁移等保持blocked。
4. **逐项交接。**A类须先实现新的公开SDK空会话CAS切换/恢复合同：固定同一owner、Session、bindingRevision和cwd，重新核对Native仍blank，再协调Native preset与应用绑定变更，保存过渡证据、flush及重读；locked即停止。现有replace固定新UUID、attach沿用old.agent、read/finish继续核对旧preset，均不能直接实现A；禁止先select再手改ledger补结果。B类通过新的幂等公开交接操作建立通用Session，验证ID/preset/cwd和私有scope后才切当前绑定；不能直接编辑roles.v1.json。应用实例及业务记录身份保持。建立失败/返回不同ID/响应丢失都保留未知回执，不自动新建第二次。
5. **处理业务引用。**按下面的课堂/任务规则完成后，再把旧Session登记为历史；原始日志与资料原址保留。
6. **撤出声明。**只撤出具体计划列出的考公自有旧preset注册。须实现并验证retired Session执行栅栏，停止并排空关联旧Agent、释放持有，再撤出声明并以正式目标Host冷重启实测；旧Agent持有的generation可能继续活着，不能用菜单消失代替执行禁令。栅栏、释放及冷重启验证完成前，不保证旧Agent无法执行。清点全局默认或外部配置引用的修改须有各自明确影响和确认。
7. **最终验收。**旧菜单不再出现自有考公模式、新角色从应用入口创建和继续、同实例多视图/跨实例隔离、原生轨迹/问题/审批/Stop、新旧历史入口、刷新重启及回退边界均留证。

## 未完成课堂、任务与历史owner

- `Lessons.prepare`当前会核对已保存的`binding.sessionId/presetId`，不同就拒绝“静默替换”。因此不能只调用角色replace后声称旧课堂自然继续。已完成课堂保持原binding和完成证据；未完成课堂需显式“交接继续”记录，保留旧binding及原因并关联新的当前会话。未实现这个受控操作前，该课堂继续发送保持阻止。
- 练习原题快照、答案、提交顺序、`review`及`reviewClaim.taskId/requestId`保持。`sending/unknown`必须对照原请求事实处理；不能改成ready重讲、改sent完成或重复发送。评分与错题统计不因新Session而重算。
- Worktable待发任务固定`sessionId/bindingRevision`；旧prepared内容只保留供审阅，不能替换字段后重发。用户明确放弃后，若仍需要执行，应在新角色重新准备；已accepted请求只在原会话查轨迹与恢复业务回执。
- 历史owner保存每条`sessionId/presetId/cwd`，不把旧历史“转成”新Session写入上下文。`previousSessionIds`只有ID时不足以授权历史工具；需逐条核验并形成`historicalSessions`身份依据。旧历史写入继续拒绝，读权限不自动扩大到其他实例。此处只读只覆盖考公业务工具，不覆盖原生文件写入、终端等通用工具；retired执行栅栏与旧Agent排空属于独立待实现门禁，Native输入UI也不据此声称强只读。
- 尚未接管的旧default需要先确认其业务归属与历史实例，不能借本次角色交接绕开09的具体旧数据迁移预览。上次部分导入合成计划及回执保留，不重放、不用新计划覆盖未知状态。

## 恢复、回退和可逆范围

交接回执至少区分prepared、creating、created-uncommitted、binding-committed、declarations-withdrawn和unknown，记录源/目标事实与已完成步骤。恢复先读取事实，只补确认记录，不默认重放创建或发送。

- B类创建成功但切绑定失败：新会话保留为待核对目标，旧当前绑定不变；不得删新会话或自动建第二个。
- 已切绑定但撤声明失败：保持新当前身份，旧声明暂留并报告未完成，不自动切回历史Agent。
- 撤声明后需回退：恢复旧版本包/配置声明本身可使旧preset重新可resolve，但不等于用户同意恢复旧当前角色。若新会话已有消息、课堂或业务写入，禁止用旧整库覆盖；旧Session和新Session都保留，角色当前归属重新预览确认。
- A类切换后若已开始turn，不能再公开select回旧preset；不能承诺preset选择总可逆。必要时回到B类交接方案，重新固定计划并确认。
- 版本回退、配置回退、角色交接回退与业务数据回退分别记录。冻结Worktable `.3`及考公 `.1`不覆盖；新SDK/插件版本另发，旧包不能破坏新的交接回执。

## 已运行的辅助原型（不是生产或实页验收）

本机可重放脚本保存在独立验收目录，原型未合入生产代码，没有启动Host、模型调用或读写正式数据：

1. 真实官方注册器及实际考公9份personas：原角色注册回归3/3通过；“应用私有角色不进全局roster”的红断言得到9个健康旧preset而非空列表；注销其中一个后后续resolve拒绝。
2. 真实3个Native Agent复用唯一standard声明，在`agent/created`分别通过公开`agent.ctx`安装官方persona与bundled Skill。两个绑定角色的人格不同、第三个未绑定Agent和全局无教学Skill、dispose后私有Skill释放；模型调用0。固定synthetic owner map仅证明Native接缝，尚未接入Worktable持久intent与SDK校验。
3. 真实公开select：空Agent保留ID/cwd切到standard；具有内存合成turn事实的Agent返回locked，原preset不变。这里的turn事实是测试输入，不是声称实际模型教学已经验收。

生产SDK仍需弥合standing-preset预检与agent-session私有Skill安装时机；不能删role.skills声明以骗过原有校验，也不能把人格塞user文本后宣称已实现。曾准备的生产接线测试草稿已移到本机验收目录，未提交失败测试或未完成接线。

### 官方依据（固定宿主提交）

- `packages/preset/agent-preset-registry/src/definition.ts`：公开PresetDefinition。
- `packages/preset/agent-preset-registry/src/index.ts`：list、select、recompose、acquireScope及退役generation保留。
- `packages/core/agent/src/runtime-types.ts`：公开agent.ctx、agent/created等待初始化、agent/pre-step。
- `packages/core/system-prompt/src/index.ts`：系统persona section与按scope装配。
- `packages/skill/skill/src/index.ts`：按context scope登记provider/Skill。

## 待办

- [ ] 用户确认A/B技术路线及上述原约束变化。
- [ ] 完成Native-session私有角色SDK、Kaogong接线及受控交接协议；不更改已冻结包。
- [ ] 全量只读清点并产出可审阅的逐条IDs/revisions/fingerprint预览。
- [ ] 用户确认具体计划后，先在合成旧格式资料和独立Host复验，再按单独批准范围执行。
- [ ] 新角色普通对话/课堂/练习及历史恢复真实验收后，确认所有旧自有模式已撤出。

</details>

### 2026-10-25 真实安装暴露的 scope 身份兼容修正

- 官方 profile 安装可保留考公 optionalDependencies 的第二份同版本 `dsh-scope`。该包的作用域标签是模块实例身份，不因版本号相同而相等。旧验证代码用应用副本 `createScope`，原生 SystemPrompt 无法识别该标签，第一次打开班主任即发生全局 `deployment:persona-prefix` 重复注册；不涉及模型请求或已有会话迁移。
- 资料与 role 创建未知状态保持保守恢复：本修复不清除 creationAttempt、重发创建、不迁移或删除会话；真实验收须显式选择新实例/角色或既有恢复操作。
- 验证作用域通过公开 Native preset peer 模块入口（`import.meta.resolve`）及以该入口为锚的 Node 包解析获取同一 `dsh-scope`，核对公开 package.json 的包名/同版版本与公共 createScope/scopeOf 函数。没有硬编码宿主目录、读取内部 Map/Symbol、修改宿主或回退到全局 Persona。真实 mount 仅接受该 Native 模块能够识别的 Agent.ctx。
- Persona/SkillFilesystem/SkillTool/AskUser 仍经传入 Native Agent.ctx 安装；后三者的实际安装构建没有另行导入 scopeOf/scopeTarget/ScopedLayers，所需技能与工具通过原生注入服务注册，撤销保留原生基础 persona 和私有角色停用护栏。
- 辅助合同使用真实官方 Agent/Persona/Skill 与独立同版 scope 模块副本，保留独立模块身份，避免 source 路径别名掩盖。标准 preset 包含原生 persona；覆盖两角色隔离、重复打开、普通会话不继承私有技能、卸载精确撤销。恢复修复前源码时以同一测试配置精确复现重复 section，修复后 Host 153/153 与公开 Host 类型检查通过。
- 辅助合同不是官方安装闭环：新 K.3/W.5 候选仍需官方 CLI 安装后通过真实界面创建班主任、辅导员、任课老师及原生模型任务验证。冻结 W.4/K.2 不覆盖。
