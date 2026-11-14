# 安装与运维

本文覆盖 `dsh-paper-reader` 的安装、启用、每日调度、手动补跑、升级、卸载与回退。规划与工单在
[`docs/wayfinder/daily-pipeline/`](wayfinder/daily-pipeline/)，不在本文重复。

## 版本与前置条件

| 项 | 要求 |
|---|---|
| DSH | `0.2.2-alpha.2`、`0.2.2-rc.1` 或 `0.2.2-rc.2`（`package.json` 的 `engines.dsh`） |
| Node.js | `>=22` |
| 包管理 | `pnpm` 在 `PATH` 上（`dsh plugin` 会转发给 pnpm） |
| 数据目录 | `$DSH_HOME/paper-reader`，默认 `C:\Users\<你>\.dsh\paper-reader` |

本插件是本地目录包，不访问 npm 仓库，也不在插件内保存任何 API key。

## 安装

在插件目录执行（路径按实际修改）：

```powershell
dsh plugin --profile web add "F:\ai-project\my-dsh-plugins\plugins\paper-reader"
```

也可以打开 DSH 插件管理页，选择「本地目录」并指向同一路径。安装后**重启 `dsh web`**（或桌面端），
让 Host 组合生效。

## 启用

1. 打开 Settings → Plugins → Plugin list。
2. 确认 `dsh-paper-reader` 已启用；若显示未启用，点击启用，并按提示重启。
3. 左侧栏出现「论文阅读」入口即表示 Host 与浏览器两端都加载成功。

插件只读 `$DSH_HOME/paper-reader`，不会创建或迁移用户数据。

## 每日 09:00 调度（DSH Schedule）

目标是用 DSH Schedule 在本地时区每天 **09:00** 打开一个**新会话**运行 CLI；抓取、翻译、写文件和
失败恢复都由 CLI 完成，agent 只负责运行与汇报，不把长文塞进上下文。调度不会自动重放历史日期。

### 方式一：在 Automation tasks 页面手动创建

1. 打开侧栏 **Automation tasks**，选择 **New** 旁的 **Choose a creation method** → **Create manually**。
2. **Automation task name**：`论文日报`。
3. **Automation task instruction** 填入下面的内容（把目录换成你的插件目录）：

   ```text
   在插件目录运行每日抓取，并只汇报结果：
   Set-Location 'F:\ai-project\my-dsh-plugins\plugins\paper-reader'
   node scripts/paper-reader.mjs
   退出码为 0 时汇报条数、耗时与失败/跳过来源；退出码非 0 时汇报 stderr。
   不要自动重试，也不要补跑历史日期。
   ```

4. **Run in**：选择 **New conversation for every run**（每次运行新建会话）。不要选
   “Create a conversation and reuse it”，否则所有天会挤在同一个会话里。
5. **Linked workspace**：选择包含插件目录的 Workspace；新会话从该 Workspace 启动，指令里的
   `Set-Location` 仍然负责把工作目录固定到插件根目录。
6. **Run time**：**Every day**、**09:00**、**Time zone** 选 `Asia/Shanghai`（或你所在时区的
   IANA 名称，例如 `Europe/Berlin`、`America/Los_Angeles`）。
7. 点击 **Create**。在任务详情里确认 **Repeat** 是每天 09:00，且 **Run in** 是每次运行新建会话。

### 方式二：让模型创建

在任意会话里说：

```text
创建自动化任务「论文日报」：每天 09:00，时区 Asia/Shanghai，每次运行新建会话。
指令：在 F:\ai-project\my-dsh-plugins\plugins\paper-reader 运行 node scripts/paper-reader.mjs，
退出码非 0 时汇报 stderr；不要自动重试，也不要补跑历史日期。
```

对应 `schedule_create` 的重复规则是（`DTSTART` 写未来某天的本地 09:00）：

```text
DTSTART;TZID=Asia/Shanghai:20261106T090000
RRULE:FREQ=DAILY
```

如果使用界面里的 **Custom** 规则，同样填这两行。`TZID` 必须是 IANA 名称，不能用 `UTC+8`
这类固定偏移。

### 时区与夏令时

规则按 `TZID` 的本地墙钟时间运行：夏令时切换时跳过不存在的本地时间，重复的本地时间只运行较早
一次。旅行或改时区后，编辑任务的 Time zone，而不是改系统时钟。

### 错过、失败与补跑

- **Host 关闭/重启**：DSH 恢复调度时，对重复任务只投递**最近一次错过的 occurrence**；更早的
  多次错过不会逐条重放。这是 Schedule 的“错过处理”，不是本插件的重试逻辑。
- **运行失败**：CLI 退出码非 0 表示当天没有写成任何 digest；agent 应汇报 stderr，人工判断后再
  补跑。不要开启自动重试循环。
- **投递记录 ≠ 执行成功**：Automation tasks 的 Records 只证明消息进了会话 inbox，不证明 CLI
  成功。以 CLI 输出、退出码和 `runs/YYYY-MM-DD.json` 为准。
- **补跑历史某天**：手动执行 `node scripts/paper-reader.mjs --date YYYY-MM-DD`，一次一天；不要写
  循环批量回放。补跑只影响指定的日期，不会自动补齐其他漏掉的天。

## 手动补跑（CLI）

CLI 与调度使用同一入口，配置在 `$DSH_HOME/paper-reader/config.json`（可选，缺失时用默认值）：

```powershell
node scripts/paper-reader.mjs                          # 今天，正常写入
node scripts/paper-reader.mjs --date 2026-11-04        # 指定日期补跑/重跑
node scripts/paper-reader.mjs --dry-run                # 只抓取和统计，不写文件，也不翻译
node scripts/paper-reader.mjs --source hf              # 只跑一个来源
node scripts/paper-reader.mjs --help                   # 完整参数
```

可用的 `--source`：`arxiv`、`deepseek`、`anthropic`、`kimi`、`hf`、`openai`。

- 同一天重复运行会原子覆盖当天的 digest、索引条目和 `runs/YYYY-MM-DD.json`；当天的翻译 token
  预算会接着已用额度计算，不会因为重跑翻倍。
- `--dry-run` 不写 digest、索引或 run 记录，也不调用翻译；抓取仍然发生。
- 退出码：`0` 已写入（或 dry-run 完成）、`1` 抓取失败且未写入、`2` 参数或配置错误。
- 历史日期补跑不会自动重放其他日期；需要哪一天就明确传哪一天。

## 用 DSH 本地凭据运行（推荐）

如果 DSH 里已经配置了模型密钥，不必再复制一份到环境变量：

```powershell
node scripts/run-daily.mjs --date 2026-11-05
```

`run-daily.mjs` 只做三件事：从 `$DSH_HOME/.credentials.yaml` 的 `refs` 读出指定凭据、在**子进程环境**里设置 `PAPER_READER_LLM_*`、启动普通 CLI。它不打印、不写入、不把密钥落到 digest/日志。默认凭据是 `ZAI_CODING_CN_API_KEY`（智谱），可用 `PAPER_READER_DSH_CREDENTIAL_REF` 换一个 ref；显式设置的环境变量优先。

`$DSH_HOME/paper-reader/config.json` 可以固定端点、模型、代理、预算与质量门槛（不含密钥）：

```json
{
  "proxy": { "url": "http://127.0.0.1:7897" },
  "translation": {
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "model": "glm-4-flash",
    "dailyTokenBudget": 1200000,
    "timeoutMs": 60000,
    "retries": 1
  },
  "quota": { "total": 8, "papers": 3, "blogs": 5 },
  "selection": {
    "importance": {
      "enabled": true,
      "minScore": 6,
      "strongScore": 9,
      "maxOverflow": 3,
      "model": "glm-4.6"
    }
  }
}
```

### 模型选择与额度

- **批量翻译用便宜的模型**：翻译是几十万个 token 的活，`glm-4-flash` 免费且快（约 3 秒/批）。用编码套餐的 `glm-4.6` 翻全文会吃掉 5 小时编码额度。
- **质量门槛用强的模型**：`selection.importance.model` 每天只有一次小请求（候选标题+摘要，约 2k token），用 `glm-4.6` 判分明显更准。实测 `glm-4-flash` 会把「Gemini 新模型发布」判成 3 分、把「漏洞悬赏」判成 8 分。
- 换供应商只需改 `translation.baseUrl` / `translation.model`，并把 `PAPER_READER_DSH_CREDENTIAL_REF` 指到对应 ref（`ZAI_CODING_CN_API_KEY`、`OPENCODE_GO_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`）。
- `OPENCODE_GO_API_KEY` 的端点是 `https://opencode.ai/zen/v1`，模型 id 形如 `deepseek-v4.1-flash`；账号余额为 0 时所有模型都返回 `402 Insufficient account funds`。

### 质量门槛（宁缺毋滥）

`selection.importance` 打开后，每条候选先被模型打 0–10 分：

- 低于 `minScore`（默认 6）直接丢弃——当天没有值得读的就**少于配额**，不补足。
- 达到 `strongScore`（默认 9）的条目可以**超出每日配额**，最多 `maxOverflow` 条：真正重要的东西值得多看一篇。
- 打分的提示词明确把客户案例、合作/收购、漏洞悬赏、招聘、活动、政策声明、教程、资讯汇总判为低分；新模型发布、能力跃升、重要开源、改变实践的方法判为高分。
- 打分失败（端点不可用、返回格式错误）时**门槛自动失效**，退回原有排序，不会产出空日报。
- 门槛结果写在 run 记录的 `selection.droppedByImportance` 与 `selection.importanceOverflow` 里。

### 跨天去重

每条已发布条目的 URL（以及 Kimi 这类抽取后会规范成另一域名的 slug）记录在 `state/sources.json`。规则是「在任何**其他日期**展示过就跳过」：

- 重跑今天：今天自己的条目会被保留（记忆里记的就是今天）。
- 补跑旧日期：不会把后来已经展示过的内容重复塞进去。

代理只从显式配置或环境变量读取，不会自动探测系统代理；HF/OpenAI 在代理不可用时按来源跳过或降级。

## 运行状态与数据

页面顶部显示最近一次运行的状态、日期与耗时、条数、翻译 token/预算，以及失败和被跳过的来源。
数据来自只读路由 `GET /api/paper-reader/status`（最近一条 run 记录）和按天 digest；状态路由读取
失败只会显示一条提示，**不会用错误页盖住上一份可读 digest**。

```
$DSH_HOME/paper-reader/
├── index.json                 # 日期索引，最后写入
├── digest/YYYY-MM-DD.json     # 单日 digest（schema v2）
├── runs/YYYY-MM-DD.json       # 每次运行的诊断记录，保留最近 30 天
├── state/sources.json         # 来源发现记忆（便于博客去重）
└── cache/                     # 翻译缓存
```

- run 记录包含来源状态、条数、耗时、翻译 token、警告与失败/跳过原因；密钥不会写入 run 记录、
  digest 或日志。
- digest 与 run 记录都按 30 天保留，写入新记录后清理更早的同名日期文件；清理失败只报告，不阻塞
  当天写入。
- 单日 digest 上限 8 MiB；超限的当天失败并保留上一份文件。

## 升级

1. 备份数据目录：复制 `$DSH_HOME/paper-reader` 到安全位置。
2. 更新插件 checkout 到目标版本，安装依赖并重新构建：

   ```powershell
   git pull
   pnpm install
   pnpm build
   ```

3. 重新安装本地包并重启：

   ```powershell
   dsh plugin --profile web remove dsh-paper-reader
   dsh plugin --profile web add "F:\ai-project\my-dsh-plugins\plugins\paper-reader"
   ```

4. 打开 Settings → Plugins 确认版本；打开页面确认「最近一次运行」和最新 digest 仍可读。

数据文件是向后兼容的 v2；升级不会迁移或删除 `digest/`、`runs/`、`state/`、`cache/`。

## 卸载

```powershell
dsh plugin --profile web remove dsh-paper-reader
```

重启 DSH。卸载只移除插件与组合层，**不删除** `$DSH_HOME/paper-reader` 下的数据；需要彻底清理时
手动删除该目录。别忘了在 Automation tasks 中删除或暂停「论文日报」任务，否则宿主仍会每天创建
会话。（`dsh plugin --profile web list` 可确认已移除。）

## 回退

1. 保留上一版的 checkout 目录或 tarball（`pnpm pack` 产物）。
2. 卸载当前版本，安装上一版并重启：

   ```powershell
   dsh plugin --profile web remove dsh-paper-reader
   dsh plugin --profile web add "F:\backup\paper-reader-0.1.0"
   ```

3. 如需恢复数据，停止 DSH 后用备份覆盖 `$DSH_HOME/paper-reader`，再启动。
4. 页面仍能读旧版写下的 digest（v1 `en/zh` 与 v2 都支持）。

回退后检查 `runs/` 中最后一条记录与页面状态条，确认新版本没有留下不可读的文件。

## 版本锁定与不匹配拒绝加载

- 插件把 DSH 版本限定在 `package.json` 的 `engines.dsh` 范围内，Node 固定在
  `engines.node: ">=22"`。声明列出允许加载的宿主版本；rc.2 的准入、Host 导入与客户端工厂检查由仓库根目录 `scripts/dsh-rc2-compat.test.mjs` 执行，不代替真实 profile 安装和页面验收，也不承诺未知版本兼容。
- 安装或激活时，DSH 插件管理器会校验 `engines.dsh`（以及声明的 DSH peer 包）。不匹配会被拒绝，
  错误码为 `incompatible-version`，拒绝信息会列出包名、版本、当前 runtime 与未满足的
  `engines.dsh`；profile 自动启用也可能以退出码 1 结束并给出包名诊断。**拒绝加载是预期行为**，
  不要用 `allow-version` 豁免绕过：豁免只跳过检查，运行时仍可能崩溃或写坏数据。
- DSH 升级后：优先安装明确支持当前 DSH 的插件版本；未知版本须在确认客户端契约后更新插件的 `engines.dsh`、
  重新构建并完整回归（`pnpm test` 与页面冒烟），再安装新版本。不要只改版本号而不验证。
- 检查当前版本：

  ```powershell
  dsh plugin --profile web list
  ```
