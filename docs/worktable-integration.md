# 工作台接入 Harness：步骤、影响与回退

## 当前接入顺序 · 2026-10-25 · Harness rc.3 / W.7 / K.7

本节覆盖下方旧版本/旧入口的历史说明。当前最终验收和接入目标是未经补丁的官方 Harness `0.2.1-rc.3`（`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`），准确工作台 `0.10.0-rc.3.7` 与考公 `0.2.0-rc.3.7`。源码及规格在插件仓库 `D:/programming/workspace/my-dsh`，当前集成分支 `codex/kaogong-rc3-completion`。插件兼容公开宿主接口，不修改 Harness 源码或原生Editor。

目前已在独立3101实际验证冷角色、原生输入/工具、统计、合成资料与同准确包移除重装恢复；[当前证据及剩余门槛](evidence/2026-10-25/rc3-fresh-installed-current.json)是进度入口。正式profile已官方离线注册准确W.7/K.7，3080尚未运行；推送和最后安全清理由11继续控制。最终准确包重装后的Native问题/Stop/审批矩阵已通过。K.7已使用官方stock源码命令、Native cwd且不设置TSX_TSCONFIG_PATH实际验收；无需用户添加该变量。

| 顺序 | 操作 | 影响与核对 |
| --- | --- | --- |
| 1 | 核对实际CLI入口、Native提交与目标 `DSH_HOME` / web profile，停止该目标自有进程 | 只选一个目标；从D盘启动不表示profile也在D盘。保留其他实例及原生工作区。 |
| 2 | 在服务停止时备份目标profile及配置，记录插件、12个既有bundle、9个既有依赖、会话/存储与资料引用清单及hash | 新增私有备份，不提交凭据或业务数据到仓库。不得用整库覆盖方式升级。 |
| 3 | 使用新的专用角色工作目录 `D:/programming/workspace/my-dsh/workspaces/kaogong` | 用户已授权创建且已通过官方公开WorkspaceRegistry登记；`/workspaces/`被Git忽略。它用于老师生成学习文件，不能把原材料根当cwd。正式roleCwd已精确切到该目录并启用考公；该登记不改变原资料根，也未启动3080。 |
| 4 | 核对准确W.7/K.6归档的版本、bytes及SHA，对照公开receipt；经官方CLI在所选profile安装 | 新增/更新所选插件、对应bundle与锁定；保留其他插件、依赖和配置，不手工改原生bundle。版本不匹配时停止，不临时放宽peer范围。 |
| 5 | 仅在考公自己的配置中将 `roleCwd` 指向上述已登记专用目录，保留其他原有配置并显式启用所需插件 | 旧正式配置原为disabled且cwd指向原材料根；本次已精确改为启用并使用新专用目录，其他配置保留。新部署使用标准Native preset和应用私有角色/Skills，无需全局注册班主任模式。 |
| 6 | 启动选定官方入口，验证菜单、空新学习实例、角色创建/冷恢复、Native输入/轨迹/提问/Stop/审批 | 新学习实例为空；不迁、不删旧会话、成绩、笔记或学习记录。不要把Native idle/unknown当作业务完成。 |
| 7 | 有需要时在资料库界面只读预览原资料，检查来源revision、目标空库、条数、私有排除、图像/PDF/MinerU引用和fingerprint | 预览不搬原文件、不接管历史会话、不自动共享。正式资料当前仅只读清点；必须对这一份具体materials-only计划另行明确确认后才写入新目标。 |
| 8 | 显式将资料库公开题库/资料授权给指定学习实例，在应用里刷新后再使用；按需撤销 | 私有/来源不明资料不默认共享；撤销阻断后续读取并清旧阅读正文/图像，不删除原资料和已发Native历史。 |
| 9 | 关闭/重开、刷新/重启及同包卸载重装核对，最后才记录正式注册与远程提交 | 配置、存储、Session保留；失败时停止目标自有进程，按具体备份和已审冻结包回退，不整库回滚覆盖新学习记录。 |

官方compiled CLI的安装命令形态如下。执行前先按步骤1设置并复核目标 `DSH_HOME`；文件均来自插件仓库，安装到所选profile而非复制进Harness源码：

```powershell
node D:/programming/workspace/deepseek-harness/apps/cli/lib/bin.js plugin --profile web add D:/programming/workspace/my-dsh/plugins/worktable/01_content/dist/v0.10.0-rc.3.7/dsh-worktable.tgz D:/programming/workspace/my-dsh/plugins/kaogong/releases/deepseek-ai-dsh-tool-kaogong-0.2.0-rc.3.7.tgz --offline
```

原资料路径仍以实际明确配置为准：`materialSourceHome`是只读资料元数据来源；`legacyMaterialRoot`是原集合根；`questionImageRoot`是题图根；`mineru.outputDir`是实际解析作业根。这四者不能互相猜测、改为同一个目录或用新的roleCwd替代。资料不存在/证明不符时保留并拒绝，不猜路径补齐，不自动运行MinerU。


正式安装后的核对已完成：工作台9文件、考公65文件与准确归档逐一hash一致；根依赖总数前后均9（替换W/K两项、其余7项保持）/原12个bundle保留且安装后共13个bundle及原patch/MinerU/题图路径保持深相等。正式profile未启动。独立验收同包移除重装的28个Session/存储/配置hash相同；正式资料仅只读清点，尚未导入。

Windows临时工作树清理曾触发长路径/链接遍历事故，3个Native tracked文件已按官方提交精确恢复、2个编译依赖库按官方构建重建；最终Native clean22ddee且K.7四入口Host167/公开types通过。后续按nofollow清点→非递归断指针→零链接证明→删除自有文件，详见[脱敏恢复记录](evidence/2026-10-25/rc3-cleanup-recovery.json)。这不是接入需要修改Native源码，亦不能隐去此次实际触及及恢复。
## 以下为旧阶段操作记录与背景（按当前接入顺序解释）

2026-10-24 最新检查点：原生 rc.3 已从 D 盘原仓库完成官方构建并启动 3080，使用原 C 盘 home；[启动与验证详情](harness-rc3-readiness.md)。下文适配、隔离验收和正式部署顺序继续有效；本次原生启动不代表各插件已完成新版本验收，较早的停机表述按当时状态解读。

更新：2026-10-23。本文是当前接入操作说明；历史验收文档中的“当前运行”只代表当时状态。用户要求停止后，先前启动的正式与验收实例均已停止。说明编写后已按用户授权清理编译残留并定向恢复 3 个 vendor 文件；未重新构建、安装、迁移或启动服务。

## 1. 先确认版本与目录

目标是让插件兼容 Harness 的公开接口，保留原生菜单、工作区、对话、轨迹、审批和 Stop。工作台代码在插件仓库维护，接入不要求修改 Harness 源码、替换原生组件或给 lib 打补丁。

| 内容 | 本机位置 | 负责什么 |
| --- | --- | --- |
| Harness 源码 | `D:/programming/workspace/deepseek-harness` | 原生程序和它的编译产物 |
| 插件仓库 | `D:/programming/workspace/my-dsh`，分支 `codex/worktable-framework` | 工作台、应用插件、规格和工单 |
| 工作台源码 | `plugins/worktable/01_content`，相对于插件仓库 | 平台、项目、实例、视图和原生执行适配 |
| 考公源码 | `plugins/kaogong`，相对于插件仓库 | 考公业务、老师、题库和资料引用 |
| 正式 DSH home | `C:/Users/pc-zzy/.dsh` | 原有设置、模型连接、会话和存储 |
| 正式 web profile | `C:/Users/pc-zzy/.dsh/profiles/web` | 已安装插件、依赖锁定、bundle 和配置覆盖 |
| 考公资料目录 | `D:/programming/workspace/my-dsh/materials/kaogong` | PDF、图片、讲义和 MinerU 结果；以当前配置实际引用为准 |
| 已验证的旧运行时 | `D:/programming/workspace/my-dsh/.scratch/native-alpha2-consistent-windows-20261023` | 独立一致 alpha.2 构建；保留作已验入口与回退参考 |

**“注册到 harness”实际是给选定 DSH home 的 web profile 安装插件。** 从 D 盘源码启动，也可以使用 C 盘原有数据。这不是把插件源码复制进 Harness。`DSH_HOME` 决定数据目录；当前工作目录不会自动把数据迁到该目录的 `.dsh`。`DSH_SOURCE` 在既有本地开发脚本中用于选择原生源码，不能代替 `DSH_HOME`；直接运行 CLI 时还须确认实际 CLI 文件来自哪个版本。

| 组合 | 目前证据 | 当前能否认定接入完成 |
| --- | --- | --- |
| Worktable 0.9.6 + Notes 0.2.1 + Reading 0.2.2 / DSH 0.2.0-rc.2 | 独立安装和限定用户流程验收 | 仅对已记载范围有效 |
| 同三包 / DSH 0.2.1-alpha.2 一致构建 | 独立验收及正式 profile 同步记录 | 仅对已记载范围有效 |
| 同三包 / 当前 DSH 0.2.1-rc.3，提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` | 当前源码版本已核对；尚未完成适配和闭环 | **不能；旧包已注册不等于新宿主兼容** |
| 考公 0.1.0 / 新派生工作台 + rc.3 | 仍依赖旧 personal-workbench 接口和旧原生版本范围 | **待迁移，不直接启用替代旧应用** |

## 2. 操作顺序与影响总表

以下是后续适配与部署的顺序，已完成现场核对和授权残留清理，尚未执行构建、安装、迁移或启动。第 6 步的正式安装必须等第 5 步通过。

| 步骤 | 怎么做 | 会影响什么 | 通过条件 |
| --- | --- | --- | --- |
| 1. 记录现场 | 核对版本、Git 状态、profile、端口、资料路径 | 只读，不修改现场 | 每个差异可分类，选定准确宿主提交 |
| 2. 备份 | 服务停止时备份原 home、profile 和资料引用清单 | 新增私有备份，占用磁盘；可能包含凭据 | 备份可读、路径和时间可追溯，不提交 Git |
| 3. 准备原生运行环境 | 按选定提交的官方依赖和构建流程准备一致产物 | 依赖目录、构建缓存和产物；不应产生源码补丁 | 未安装我们插件也能启动原生 UI，原生必需插件正常 |
| 4. 修改插件适配 | 在 my-dsh 中修复公开接口、版本声明和应用接入 | 插件源码、测试、文档、新版本包 | 不依赖修改 Harness；不能只放宽版本限制 |
| 5. 隔离验收 | 用独立 home 安装新包，走真实用户流程 | 只新增验收配置、合成数据与会话 | 原生能力、实例隔离、恢复和回退均有证据 |
| 6. 正式注册 | 官方 CLI 给原 web profile 安装已验归档 | profile 包清单、锁文件、node_modules、bundle；可能有安装日志和缓存 | 包版本、哈希、依赖和配置差异符合计划 |
| 7. 启动 3080 | 显式选定运行时、原 home 和 web profile | 开启进程；正常启动可能写日志、缓存和设置 | 实际页面正常，原会话和业务数据可见 |
| 8. 正式点测 | 检查入口、继续实例、对话和资料 | 点测可能产生空实例、布局或会话；须记录 | 不以目录可见代替业务验收，不重复注册角色 |
| 9. 有问题回退 | 停服，恢复已验包组合和对应配置 | 插件依赖与配置；业务数据单独判断兼容性 | 旧运行时和旧包恢复，数据与会话仍可读取 |

## 3. 第 1—2 步：记录和备份

先在 PowerShell 做只读检查：

```powershell
Set-Location 'D:/programming/workspace/deepseek-harness'
git rev-parse HEAD
git status --short
(Get-Content ./package.json -Raw | ConvertFrom-Json).version
Get-Item Env:DSH_HOME -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
```

`DSH_HOME` 未设置时默认是用户目录下 `.dsh`。使用自定义 home 时还须检查实际启动命令及其解析结果；不要仅凭环境变量缺省推断某个既有进程的数据位置。清理前的 321 项状态已按授权处理，旧 kaogong.cordis.yml 也已归档，当前仅保留考公 Skill 历史链接，跟踪文件差异为空，详见[现场核对与清理结果](harness-working-tree-inventory.md)。不得用 `reset --hard` 或 `clean` 代替逐项核查。

停止目标实例后，将 `C:/Users/pc-zzy/.dsh` 备份到另一个有足够空间的私有目录，至少保留 profile 的 `package.json`、锁文件、Cordis 配置及会话、业务存储。备份不可复制回自身，也不可推送仓库。另记下考公的 `roleCwd`、`questionImageRoot`、MinerU `outputDir` 和旧路径链接的实际目标；密钥只保留在私有备份，不写入说明。

## 4. 第 3 步：准备原生环境

原生环境问题和插件兼容问题分开解决。先前启动日志出现原生缺失 lib 文件、插件版本不匹配和端口占用，单独解决其中一项不能保证启动完成。

下面是当前 rc.3 源码定义的官方命令；在未归因差异和备份处理完成后执行，不是本次已执行记录：

```powershell
Set-Location 'D:/programming/workspace/deepseek-harness'
# package.json 要求 Node >=24.9.0、pnpm 11.28.5
pnpm install --frozen-lockfile
pnpm run build
```

安装会写依赖、缓存，并可能执行仓库定义的生命周期脚本；构建会写编译产物和缓存。`pnpm install` 本身不等于完成原生构建。`pnpm run start:web` 跳过构建，不能修复缺失 lib。

执行前后比较 Git 状态；如果又有产物落进 `src`、跟踪文件被删或改动，先查明触发命令与输出配置。正常接入不应要求提交这些差异，不通过忽略规则隐藏它们。原生基线启动失败时先停在此步，不把错误归到工作台，也不修改原生源码来迁就插件。

## 5. 第 4—5 步：插件适配和隔离验收

在 `my-dsh/plugins/worktable/01_content` 调整公开接入；在 `plugins/project-notes`、`plugins/reading-statistics` 验证消费者。依赖真实原生接口的包须更新兼容声明、构建和消费者测试；只把旧版本范围改为 `*` 或添加版本豁免不能算适配。

发布使用新版本和新的冻结归档，保留 0.9.6 等已验包。Worktable 按自身发布脚本 `npm run pack` 生成归档；不要用根目录旧 personal-workbench 启动命令部署新工作台。

验收使用独立 `DSH_HOME`，例如另建专用验收数据目录与空闲端口；不能只换端口却共用正式 web profile。模型连接仅在授权范围内配置，默认不复制正式会话、题库或资料。对 rc.3 至少验证：

1. 原生菜单、工作区、对话、轨迹、审批与 Stop 可用。
2. 工作台项目、网页模块、深度应用、同实例多视图正常；不同实例和项目的数据、角色与会话按约定隔离。
3. 共享数据需显式授权，撤销后读取被拒绝。
4. 原生 AI 真正执行；失败、取消和等待不会显示为业务完成。
5. 关闭重开、刷新、重启、停用重启用、卸载重装和升级回退保留正确状态。

完整范围仍以[框架规格](wayfinder/worktable-platform/framework-spec.md)和[技术路线](wayfinder/worktable-platform/technical-roadmap.md)为准。既有上游限制与未完成要求不因为 rc.3 能启动而自动关闭。

## 6. 第 6 步：把已验包注册到正式 web profile

**此步骤待 rc.3 适配包通过后执行。以下变量是占位符，不是现成的新版本包。** 不把旧 0.9.6 三包当作 rc.3 已验组合安装。

```powershell
Set-Location 'D:/programming/workspace/deepseek-harness'
$env:DSH_HOME = 'C:/Users/pc-zzy/.dsh'
$worktablePackage = '<已通过 rc.3 验收的工作台 tgz 绝对路径>'
pnpm dsh plugin --profile web add $worktablePackage --ignore-scripts
```

Notes、Reading 或其他应用分别用同一官方入口安装各自已验归档。需要指定 pnpm store 时，沿用该 profile 已有 store 和安装器要求，不能为了排错随意切换 store 或自动安装另一套原生依赖。

官方 CLI 安装会更新原 home 的 profile 依赖并按包的 bundle patch 接入服务。工作台 patch 只新增自己的插件条目；不应替换整份原生配置，也不覆盖用户其他插件。安装后核对依赖、bundle 是否各一份，并在原生插件管理页确认实际启用状态。

保留旧 personal-workbench、旧考公和资料，但避免同一功能的新旧入口同时启用。其他第三方插件若有警告，单独记录，不为让工作台显得正常而擅自禁用。此操作不往 Harness 源码目录复制插件。

## 7. 第 7—8 步：从原 Harness 目录启动并检查

可以直接从 `D:/programming/workspace/deepseek-harness` 启动，前提是它本身构建一致、且新插件组合已通过该提交的验收。并非必须换目录运行；先前另建 alpha.2 运行时是当时的一致构建方案，不能证明当前 rc.3 已通过。

```powershell
Set-Location 'D:/programming/workspace/deepseek-harness'
$env:DSH_HOME = 'C:/Users/pc-zzy/.dsh'
pnpm dsh web --no-open --host 127.0.0.1 --port 3080
```

这条命令使用原仓库 `apps/cli/src/bin.ts`，不是另建 alpha.2 的 CLI。用浏览器打开 `http://127.0.0.1:3080/`，核对实际运行版本、工作台唯一入口、旧会话列表与应用数据。已有记录应从“继续”恢复；不要反复新建角色或实例来代替恢复检查。

发现 `EADDRINUSE` 时检查占用进程所属路径，再决定是否停止；不按端口范围杀掉所有 Node。原生 required 插件失败时不得把“HTTP 有响应”当成可用。

## 8. 接入自己开发的应用：与插件安装是两层操作

先由官方 CLI 安装应用插件，再由应用通过 Worktable SDK 注册目录、视图和能力。把网页地址填入网页模块可以先使用网站；需要实例隔离、业务资源和角色时，再开发深度应用。

1. 在 `my-dsh/plugins/<应用名>` 建立独立插件，声明自己的包、bundle 和客户端入口；原生版本与 Worktable 协议须匹配。
2. Host 通过 `worktableApplications.contribute` 注册应用 ID、协议版本和可用视图；使用 `requireProtocol` 检查所需能力。
3. Client 通过 `worktableApplicationViews.register` 注册每种视图；同实例多视图读写相同业务状态，视图筛选等显示偏好单独保存。
4. 应用持有自己的业务存储，通过 `worktableResources.register` 提供受控资源；所有读写验证实例归属，跨实例读取走显式共享授权。
5. 需要 AI 时通过 `worktableRoles.contribute` 注册角色。应用私有 Agent/Skill 保持私有；公共管理入口创建的能力才按配置复用。准备任务不等于创建会话或发送消息。
6. 注册与监听都纳入 Cordis 生命周期，卸载时释放。原生对话、轨迹、审批、Stop 由公开原生能力提供，不另造一套假状态。
7. 用两个项目、两个实例、多视图与重启验收后再发布新包。

可对照[Project Notes Host](../plugins/project-notes/src/index.ts)、[Client](../plugins/project-notes/src/client.tsx)和[SDK 说明](wayfinder/worktable-platform/implementation/10-sdk-contract.md)。这是现有实现示例，rc.3 所需变化仍须在适配时验证。

## 9. 考公接入：先保护旧数据，再迁移接口

当前考公仍依赖 personal-workbench，不能通过换个菜单就认定接入新工作台。后续按以下顺序推进：

1. 核对旧业务存储、角色绑定、原生 session ID、工作目录和资料引用，不先改题库或清空旧实例。
2. 将应用注册、视图、资源、角色和任务准备接口迁到派生 Worktable SDK，移除运行时对旧工作台的依赖。
3. 明确旧 `default` 学习记录由哪个新实例接管，保留迁移前后映射和回退记录；不把旧数据复制给每个新实例。
4. 保留已有老师会话身份和历史 cwd；新实例隔离，历史会话仍可打开。
5. 保留 `questionImageRoot`、MinerU `outputDir` 与旧目录链接。不能删除 `D:/programming/workspace/kaogong`，直到确认所有历史引用均可恢复；token 不进入应用包。
6. 用原记录验证进度、练习评分、课堂完成、图片和讲义，再验证原生教学对话、审批、Stop 与重启恢复。升级适配本身不修改答案。

涉及存储格式或角色归属变化时，先明确迁移预览、影响数量和回退条件，再写正式数据。当前尚未执行这部分迁移。

## 10. 回退和交付判定

失败时先停止目标实例，保存报错和实际版本，再通过官方插件安装入口恢复上一个已验的精确包组合，复核配置覆盖和启用状态；必要时同时回到匹配的已验原生运行时。不得只降一个包而保留不匹配的 SDK 消费者。

包回退不自动等于业务数据回退。新格式能否被旧版读取必须事先验证；不能用整份旧 home 覆盖上线后新增会话或学习记录。数据确需恢复时先保存当前副本，按迁移记录处理。

正式完成需要交付：宿主提交与版本、插件包版本及哈希、安装前后配置差异、真实用户流程证据、旧数据/资料保护结果、明确回退步骤和已知限制。目录中有代码、profile 中有依赖、插件不报错，各自都不足以单独证明完成。
