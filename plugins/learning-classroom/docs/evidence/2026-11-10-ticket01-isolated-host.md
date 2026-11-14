# 工单 01：真实宿主最小课堂 — 隔离环境与接入证据

Status: **实现候选，工单未关闭**。本节区分三类证据：**源码/自动化证据**、**真实隔离安装与页面证据**（2026-11-10 root 已记录，G01/G02 部分、G08 仅 composer）、**仍缺的真实证据**（真实模型输出、Stop/提问/审批、工具写入探针）。
真实证据原文以 root 的 `D:\programming\workspace\dsh-plugins\.research\learning-classroom-b-v2\ticket01-browser-receipt.md` 为准；本文件只做归档与边界说明，不扩大其结论。

- 日期：2026-11-10
- 执行者：lcb2-01（implement-spec 子代理，源码与脚本），监工/真实验收：root（DevTools page 4）
- 分支：`ticket/lcb2-01-native`，集成分支 `feature/learning-classroom`
- 范围：只改 `plugins/learning-classroom`；未改 kaogong、未改宿主 checkout、未改正式 profile、未重启 3080。

## 1. 宿主身份（实测）

| 项 | 值 | 证据 |
| --- | --- | --- |
| 宿主 CLI | `D:/programming/workspace/deepseek-harness/apps/cli/lib/bin.js` | `--version` 输出 |
| 宿主版本 | `0.2.2-rc.1` | `dsh --version`、`packages/boot/app-boot/package.json` |
| 正式宿主端口 3080 | 存活；根路径 `GET /` → 401（未认证，属正常信任围栏） | 只读探测，本次未重启 |
| 运行时 cordis | `4.1.0` | `apps/cli/node_modules/@deepseek-ai/cordis/package.json` |
| 核心宿主包 | `dsh-host-webserver`、`dsh-storage-domain`、`dsh-api-session-controller` 均 `0.2.2-rc.1` | 各 `package.json` |
| 正式 profile | `~/.dsh/profiles/web`，含用户定制与凭据 | 仅只读查看，未修改 |

### 1.1 真实隔离安装与页面证据（root，2026-11-10，端口 3091）

来源：`ticket01-browser-receipt.md`。以下均为**真实执行**记录，不是替身测试结果。

| 事实 | 记录 |
| --- | --- |
| 隔离体 | 宿主 0.2.2-rc.1，`DSH_HOME=.research/lc-b2-01-runtime/home`，profile `lc-b2-01`，端口 3091；正式 3080 未安装插件、未重启 |
| 准确包 | 安装 archive SHA-256 `5a1032ccd6d696d864d47fc9faf388e89aa137181c7ae25ede29bbcca6f7b838`；该包早于后续 README/脚本修订，运行时 JS 未变 |
| 回归 | root 在本工作树跑 `check/test/build`：**119/119 通过**（含真实 runtime 兼容判定） |
| 依赖 | `pnpm install` 依赖安装完成后报 `ERR_PNPM_IGNORED_BUILDS`；无安装脚本被批准/执行；随后 `check/test/build` exit 0 |
| 入口 | DevTools page 4 在 3091 的真实外壳里，侧栏「学习课堂」能打开插件 |
| 知识库 | 通过表单选择真实隔离知识库；**库选择经真实隔离宿主重启后仍保留** |
| 主题与讲义 | 通过真实 UI 创建主题「原生验收」；root 在库内造样例 Markdown，用「刷新讲义目录」发现并打开，标题、引用、代码均渲染 |
| 笔记落盘 | 在「笔记」编辑器修改并点「保存」；root 读磁盘 `vault/原生验收/笔记/我的笔记.md`，内容与所写完全一致：`样本空间包含所有可能结果。DevTools 真实落盘验收。` |
| 老师会话 | 点「打开老师会话」后，课堂内出现**真实内嵌原生 composer**，显示模型 DeepSeek V4.1 Flash 与 workspace-write 访问模式 |
| 未做 | **未发送任何消息**，因此无回复、无 Stop、无提问、无审批、无工具写入探针 |
| 截图 | 截图工具以"输出路径不在配置的浏览器 roots 内"拒绝；未重试、未绕过。文字快照是实际操作证据，截图仍缺 |

### 1.2 模型配置与凭据边界（事实更新，覆盖早期子代理推断）

- 用户明确允许"仅隔离复制凭据 + 必要 provider 配置 + 少量 Flash 样例"。
- root 先把授权凭据复制进隔离 home（未打印内容；出厂目标文件需先备份）；随后尝试用最小 ref 覆盖时被 **CC Safety Net 敏感文件名规则拦截**，明确 no-retry / no-workaround；root **停止一切凭据操作**。
- 用户选择**自行在隔离环境配置模型**并继续非模型检查。**在用户确认手工配置完成前，不应运行任何模型调用。**
- 用户模型 patch 只复制 `llm-deepseek` / `agent-default-model` / `llm-pi-ai` 三个配置块（不含密钥字面量），已在 3091 重启时生效；当前隔离服务是 root 的托管 job，保留给用户手工配置，**不得重启正式 3080**。
- **不得从过期子代理报告（包括本文件早期版本）推断隔离凭据"有/无"** —— 该状态已由 root 接管，且不得再操作或读取凭据。

## 2. 真实接入缺陷与修复（TDD 红 → 绿）

### 2.1 缺陷：包声明拒绝当前宿主，安装/激活闸门必然失败

宿主用公开导出 `evaluatePluginCompatibility`（`@deepseek-ai/dsh-app-boot`）决定插件能否安装与激活：
存在 `engines.dsh` 时**只看它**，否则检查每个 `@deepseek-ai/dsh*` peer。
原 `package.json` 把三者都钉成精确版本 `0.2.1-rc.3`，而精确版本不包含 `0.2.2-rc.1`。

新增 seam 测试 `tests/host-compatibility.test.mjs`：直接 import 宿主公开导出，运行时版本取自
`getDshRuntimeVersion()`（不硬编码），因此不是复述实现，而是复述宿主自己的安装判定。

**RED（修复前，宿主 0.2.2-rc.1）**

```text
✖ 插件引擎声明接受真实运行宿主
  AssertionError: 运行宿主 0.2.2-rc.1 不满足插件声明：{"engines.dsh":"0.2.1-rc.3"}
✖ 插件宿主 peer 声明接受真实运行宿主，而不是钉死旧版本
  AssertionError: 运行宿主 0.2.2-rc.1 不满足插件 peer 声明：
  {"@deepseek-ai/dsh-host-webserver":"0.2.1-rc.3","@deepseek-ai/dsh-storage-domain":"0.2.1-rc.3"}
```

**GREEN（修复后）**：`node tests/host-compatibility.test.mjs` → `tests 2 / pass 2 / fail 0`。

改动（仅声明，无行为代码）：

| 字段 | 修复前 | 修复后 | 理由 |
| --- | --- | --- | --- |
| `engines.dsh` | `0.2.1-rc.3` | `^0.2.1-rc.3 \|\| ^0.2.2-rc.1` | 覆盖基线已验证的 rc.3 与当前运行宿主 |
| `dsh-host-webserver` peer | `0.2.1-rc.3` | `^0.2.1-rc.3 \|\| ^0.2.2-rc.1` | 同上；严格 semver 下 `^0.2.1-rc.3` 不含 `0.2.2-rc.1`，故须析取 |
| `dsh-storage-domain` peer | `0.2.1-rc.3` | 同上 | 同上 |
| `@deepseek-ai/cordis` peer | `4.0.5` | `^4.0.5` | 运行宿主实为 4.1.0，钉死会要求第二份 cordis |

未使用版本豁免；未修改宿主源码。

### 2.2 公开合同逐条核对（0.2.2-rc.1）

| 插件用法 | 宿主位置 | 结论 |
| --- | --- | --- |
| `webServer.register({kind:'exact',path,handler})`，路由匹配顺序 exact → 最长 prefix → fallback | `packages/host/webserver/src/index.ts:445`、`responderFor` | 一致；`/api/learning-classroom` 精确路由先于 `/api` 前缀传输，不会被 RPC 传输吞掉 |
| `storageDomain.open(domain)`、`domain.global.get/set`、`close` | `packages/storage/storage-domain/src/{index,domain,spec}.ts` | 一致；`learning_classroom` v1 |
| `connection.requestRejection(req)`（自建 `/api` 路由的信任围栏） | `packages/client/connection/src/rpc.ts:233`；官方 `host/open-in-app/src/index.ts:186` 同样用法 | 一致 |
| `sessions.create({cwd, agentPreset})` | `packages/api/session-controller/src/client/contract/sessions.ts:88` | 一致；`agentPreset: 'standard'` 是宿主默认预置 id |
| `sessions.retain(id,{source,signal})` / `reference.ready` / `release()` | 同上 `:58`；实现 `client/sessions/service.ts:301` 只按 source 计数 | 一致；`personalLearning` 运行期被接受（类型上属消费方声明合并约定，非运行期校验） |
| 内嵌 `conversation.content` 工厂 props | `packages/client/ui-conversation/src/client/contract/slots.ts`：`{variant, phase, hero}` | 一致 |
| `main` keyed slot + `children:{seat:{kind:'single',scope:'session'}}` → 框架注入 `renderSlot` 与 `SessionProvider` | `ui-renderer/src/client/{registry,bindings,scoped-slots}.tsx` | 一致 |
| `sidebar.panellist` root list | `ui-sidebar/src/client/{index,contract/slots}.ts` | 一致 |
| `apply` 只 `release`、不 `cancel`；收起/切课不取消 Host 回合 | 契约：`retain`/`release` 不调用 cancel | 无需改动 |

## 3. 隔离环境（脚本与命令；实际执行记录见 §1.1）

脚本：`plugins/learning-classroom/scripts/isolated-host.ps1`、`scripts/seed-vault.mjs`。
隔离守卫（脚本内置）：`DSH_HOME` 不得落进 `~/.dsh`；端口不得为 3080。
**脚本不处理凭据**：不读取、不复制、不写入任何凭据文件（§3.1）。

```powershell
$iso = 'D:\programming\workspace\dsh-plugins\.research\lc-b2-01-runtime'
$env:DSH_SOURCE = 'D:/programming/workspace/deepseek-harness'
cd D:\programming\workspace\dsh-plugins\.worktrees\lcb2-01\plugins\learning-classroom

pnpm install
pnpm check
pnpm test          # 版本合同测试需 DSH_SOURCE；不带则 skip
pnpm build

pwsh -File scripts/isolated-host.ps1 -Action setup   -Root $iso   # 建隔离 home + lc-b2-01 profile（出厂 web 模板）
pwsh -File scripts/isolated-host.ps1 -Action pack    -Root $iso   # 打出准确包，写 <iso>/package.json.receipt.json（包与 lib 的 SHA-256）
pwsh -File scripts/isolated-host.ps1 -Action seed    -Root $iso   # 隔离知识库：概率论/{讲义,笔记,脉络.canvas}；主题已存在（含空目录）则整次拒绝、不写任何文件
pwsh -File scripts/isolated-host.ps1 -Action install -Root $iso   # 装准确包（有 .tgz 时装 tgz，否则退回目录 link: 并在输出里说明无包哈希）
pwsh -File scripts/isolated-host.ps1 -Action provider -Root $iso  # 可选：只复制模型路由配置块（无密钥）
pwsh -File scripts/isolated-host.ps1 -Action start   -Root $iso   # 127.0.0.1:3091 前台
pwsh -File scripts/isolated-host.ps1 -Action status  -Root $iso   # 宿主/插件版本、engines、lib 与包哈希、隔离状态
```

- 隔离体：`<iso>/home` 为 `DSH_HOME`，`<iso>/vault` 为知识库；profile 名 `lc-b2-01`。
- profile **初始**是出厂 web 模板，不复制正式 profile 的定制与凭据；模型路由可选用
  `-Action provider` 只复制 `llm-deepseek` / `agent-default-model` / `llm-pi-ai` 三个配置块（**无密钥字面量**），
  该覆盖在 2026-11-10 的 3091 重启中实际使用。凭据不由本流程处理，见 §3.1 与 §1.2。
- 3080 与正式 profile 全程不写。
- DevTools 用 host 启动日志里的一次性认证 URL 打开 `127.0.0.1:3091`；入口在侧栏「学习课堂」。

### 3.1 凭据与模型路由：事实与边界（脚本不处理凭据）

**权威来源与路径（宿主 0.2.2-rc.1）**

| 事实 | 位置 |
| --- | --- |
| 凭据文件固定为 `$DSH_HOME/.credentials.yaml` | `packages/credentials/credentials-local/src/index.ts:61`（`CREDENTIALS_FILENAME`），`:90` 解析到 harness home 下 |
| 存在 credentials 服务时它是权威来源，不再回退环境变量 | `packages/llm/llm-deepseek/src/credential.ts:15-22` |
| 文件结构：`version: 1` + `refs:`（`KEY: value`）+ 可选 `records:`（账号/OAuth 记录） | 同包测试与正式文件结构核对（值未记录） |
| 隔离 profile 模板默认模型 | dump-config：`agent-default-model` = `provider: deepseek-official` / `model: deepseek-flash` |
| `deepseek-flash` 即 DeepSeek-V4.1-Flash | `packages/llm/llm-deepseek/src/models.ts:10` |
| 模板默认路由的凭据 ref | dump-config 中 `llm-deepseek`（`dsh-llm-deepseek-api-key`）的 `apiKeyEnv` 默认 `DEEPSEEK_API_KEY` |

**正式 profile 与模板的差异（实测）**：正式 `~/.dsh/profiles/web/cordis.patch.yml` 把路由改成
`provider: opencode-go` / `model: deepseek-v4.1-flash`，`llm-deepseek` 的 `baseURL` 指向
`https://opencode.ai/zen/go/v1`，`llm-pi-ai.providers.opencode-go.apiKeyEnv = OPENCODE_GO_API_KEY`。
隔离 profile 是**出厂模板**，不含这些行。

**两种路由方案（供用户手工配置时参考，脚本不执行凭据操作）**

| 方案 | 需要的配置 | 需要用户配置的凭据 ref | 适用 |
| --- | --- | --- | --- |
| A | 无，模板默认 `deepseek-official` / `deepseek-flash` | `DEEPSEEK_API_KEY` | 端点走 `api.deepseek.com`，不是用户的 opencode 网关 |
| B | `-Action provider` 把三条 patch 条目抽到 `<iso>/provider.patch.yml`（无密钥），`start` 自动 `--patch` | `OPENCODE_GO_API_KEY` | 与正式环境同一条模型路由 |

关于 B 的 `opencode-go` 没有 `baseURL`：宿主内置 provider 表把 `opencode-go` 列为**原生 provider**
（`packages/llm/llm-pi-ai/src/provider-data.generated.ts`：`'opencode-go': { env: ['OPENCODE_API_KEY'] }`，
无 `defaultBaseURL`），该表只在 SDK 的 baseUrl 静态时导出 `defaultBaseURL`
（`provider-data.ts:12-16`，模板化 baseUrl 故意留空），因此"配置里没有 baseURL"不等于不可用。
该判断仍以真实调用为准，未验证。

**实际发生的事（以此为准）**

- 用户授权后，root 已把授权凭据复制进隔离 home（未打印内容）；
- 之后用最小 ref 覆盖的尝试被 **CC Safety Net 敏感文件名规则拦截**（明确 no-retry / no-workaround）；
- root 停止一切凭据操作，用户改为**自行在隔离环境配置模型**；
- 结论：**本插件不提供自动凭据能力**。相关自动 Action（读取正式凭据、写隔离凭据、ACL 收紧）已从脚本整体删除，
  不留替代路径；`status` 也不再检查或统计凭据。
- 需要模型时，由用户在隔离宿主的模型设置里配置；**不得读取或搬运正式 profile 的凭据**，
  也不得据任何过期报告推断凭据"有/无"。
- 审计留痕：脚本早期版本曾包含"打印目标文件 `sha256`"的输出代码与 ACL 收紧代码，
  但在执行任何凭据操作之前就被删除；**从未产生过真实的凭据哈希输出，也从未执行过 ACL 收紧**。

### 3.2 样例知识库已用真实解析器验证

`seed-vault.mjs` 生成的 `概率论/脉络.canvas` 用插件自己的 `parseCanvasDocument` 解析通过
（Node 类型转换加载 `src/canvas.ts`，非替代测试）：

```text
{"nodes":4,"edges":2,"relations":["prerequisite","composition"],
 "files":["概率论/讲义/01-样本空间.md","概率论/笔记/我的笔记.md"]}
```

即：节点数与边数、两条边的语义分类（先修 / 组成）、两个文件节点的知识库相对路径都正确，
不是"看起来像画布"。该验证只证明样例数据合法，不证明真实宿主里脉络页面已渲染。

**重跑保护（P2 复审修复：私有 staging + 单次 rename 发布）**

- 缺陷（复审指出三处）：预检前先 `mkdir`（拒绝时已产生目录副作用）；回滚对**公开路径**做 `rm`
  （可能删掉外部替换/编辑过的文件）；`wx` 创建成功后写盘失败会留下未被回滚记录覆盖的半文件。
- 设计改为：目标主题 `概率论` **已存在一律拒绝（含空目录）**，不进入既有主题；整个主题在知识库根下的
  **私有 staging 目录**（`mkdtemp('.seed-')`）里组装；发布只有一次 `rename`；失败路径只删除自己的 staging，
  **绝不对任何公开路径做 `rm`**。半写文件只可能出现在私有 staging 内，随 staging 一起消失。
- 平台事实（本机实测，Node 25 / Windows）：
  `fs.rename(dir, existingEmptyDir)` → **EPERM**，`rename(dir, existingFullDir)` → **EPERM**，
  `rename(dir, newPath)` → OK。因此发布步骤本身会拒绝被抢占的目标；脚本把
  `EEXIST/ENOTEMPTY/EPERM/EACCES` 统一处理为"目标被抢占/无法替换"，报错文案同时说明可能是抢占或权限，
  不声称能区分二者。
- 已验证（实现者在本机真实执行，除注明外均直接调用脚本或 CLI）：
  1. 空知识库 → 生成 3 个文件，根目录只有 `概率论`，无 `.seed-*` 残留；
  2. 预置**空目录** `概率论` → CLI exit 1、该目录仍为空、根目录没有新增；
  3. 预置含学习者笔记的主题 → CLI exit 1、笔记内容逐字保留；
  4. 中途失败（发布前注入异常）→ 抛错、主题不存在、根目录为空（staging 已清理）；
  5. 目标竞争（发布前创建空 `概率论`）→ 抛 `SeedRefusedError`、该目录仍为空、根目录只有它、无 staging 残留。
- 回归测试：`tests/seed-vault.test.mjs`（5 个用例：首次生成 / 既有空主题拒绝 / 中途失败清 staging /
  发布竞争不覆盖 / 既有内容拒绝）。由 root 在装好依赖后随 `pnpm test` 执行；
  实现者沙箱内 `spawn` 型测试被 EPERM 挡住，第 4、5 项以直接调用 `seedVault` 的方式验证。
- 未声称：这不是跨进程锁，也不是对任意文件系统的原子性证明；只保证本脚本不写公开路径、不覆盖既有主题。

### 3.3 依赖安装注意（实测）

- `pnpm install` 在插件目录下载成功，但报 `ERR_PNPM_IGNORED_BUILDS`（未批准 esbuild 的安装脚本，
  未执行）。本机 esbuild 平台二进制已可用，因此 `check/test/build` 仍全部通过；这属于"安装脚本未批准"，
  不是依赖缺失，也不需要用版本豁免绕过。
- 该次安装生成了插件目录下的 `pnpm-lock.yaml`（本仓库只在根目录提交 lockfile）。是否纳入提交由
  集成负责人决定；本工单的源码改动不依赖它。
- `node-linker` 由根 `pnpm-workspace.yaml` 指定为 `hoisted`，与插件独立安装一致。

## 4. 待真实执行证据（本票未通过这些项）

| 项 | 待记录的证据 | 状态（2026-11-10） |
| --- | --- | --- |
| G01 安装身份 | 宿主/插件版本、构建产物 SHA-256、`plugin add` 输出、无 `did not activate` 警告、其他插件未被改写 | **部分通过**（§1.1）：准确包 SHA-256、119/119、侧栏入口可开、3080 未动。仍缺：无 `did not activate` 的日志原样留存、其他插件未被改写的显式核对 |
| G02 空间与文件 | 隔离知识库里讲义可读；笔记编辑后真实落盘；Obsidian 打开同一正文；重开入口恢复 | **部分通过**（§1.1）：真实选库且**重启后保留**、讲义用「刷新讲义目录」发现并渲染标题/引用/代码、笔记保存后磁盘内容逐字一致。仍缺：Obsidian 打开同一正文、目录不可访问后的恢复、保存失败重试 |
| G08 真实会话 | 课堂内真实 Session：输入 → 真实模型输出、工具卡片、Stop、提问、审批；无跳转、无假回复；单 composer | **仅 composer 接线**（§1.1）：真实内嵌原生 composer、显示 DeepSeek V4.1 Flash 与 workspace-write。**未发送消息** → 无回复、无 Stop、无提问、无审批、无工具写入 |
| 工具权限 | 标准 Session 通用文件/终端工具与插件专用写入路径的实际边界，见 §4.1 | **待验**：composer 已显示 workspace-write，但未做写入/审批探针 |

补充说明：截图缺失（截图工具拒绝输出路径、未重试未绕过）本身是验收限制，不是代码缺陷；
文字快照与 root 的磁盘核对仍是真实操作证据，但不能替代完整 G01–G14。

### 4.1 工具权限边界（源码结论 + 待验步骤）

源码结论（已核对，不改代码）：

- 插件自己的写入路径只有 `notes-io.ts` 的 `writeVaultText`；它在落盘前调用
  `notes.ts` 的 `assertVaultWriteAllowed(actor, path)`，非 `note-save` 的 actor 写 `笔记/` 会被
  `note-write-forbidden` 拒绝。本版本生产调用方只有 Host 的 `note-save` 命令，尚无老师生成工具。
- 老师会话是标准 DSH Session：它的通用文件/终端工具由宿主运行时执行，**不经过**上述守卫；
  本插件没有安装权限插件、也没有工具路径规则。`sessions.create({ agentPreset: 'standard' })`
  明确要求标准预设，因此不能声称"老师在插件内被限制为只读"。
- 原 README「Host 侧统一写入守卫：`笔记/` 只允许 `note-save` 写入，老师工具在落盘前被拒绝」
  会被读成全局写保护，已按规格第 118 行要求改写为"只覆盖插件内写入路径"，并在 README
  增加「AI 写权限边界（未验收前按下列边界理解）」小节。

待真实执行的验证步骤（在隔离知识库上做，记录审批原文与结果，不记凭据）：

1. 课堂内老师 Session 中要求创建一个非笔记文件（如 `附件/权限探针.md`），记录是否出现审批与结果。
2. 同一 Session 中要求改写 `笔记/我的笔记.md`，记录是否被宿主审批拦住、写入是否实际发生、
   笔记内容与 mtime 变化。该结果才能决定"AI 不改笔记"是强制权限还是教学约定。
3. 插件侧：用 `note-save` 正常保存成功，再用 `teacher` actor 调用 `writeVaultText` 确认被拒绝且原文件不变
   （后者已有单测覆盖：`tests/notes-logic.test.mjs`）。

### 已知边界

1. **真实模型输出仍缺，且当前不允许触发**：隔离环境已出现真实 composer，但从未发送消息。
   用户选择自行配置隔离模型；**在用户确认手工配置完成前不得运行任何模型调用**，也不得再操作或读取凭据。
   本文件不声称存在真实回复，也不声称模型不可用。
2. 版本兼容范围依据：`0.2.1-rc.3` 有既有类型检查/测试基线；`0.2.2-rc.1` 有 §2.2 源码合同核对与
   `host-compatibility` 测试（119/119 含真实 runtime 判定）。`pnpm check` 在 `pnpm install` 后
   按 `0.2.2-rc.1` 声明执行，才是类型层证据。
3. 本票**不关闭**：G01/G02 仅部分、G08 仅 composer、工具权限未探针。未通过项不因自动化或安装成功而勾选。
