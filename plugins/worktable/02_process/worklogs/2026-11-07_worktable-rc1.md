# 2026-11-07 worktable：适配 DSH 0.2.2-rc.1（rc.3.13）

> 日期 / 主题 / 状态：2026-11-07 · 宿主版本门禁与兼容声明 · 代码、打包与隔离启动已完成；正式 profile 待用户授权安装

## 目标

让 `dsh-worktable` 在 DSH 0.2.2-rc.1 上通过门禁并加载，同时把「兼容后续 0.2.x」变成可执行的机制，而不是每次升版重新钉死一个版本号。

## 根因（实测，不是推测）

- 宿主实际版本 `0.2.2-rc.1`：`~/.dsh/profiles/node_modules/@deepseek-ai/dsh` 指向 `D:\programming\workspace\deepseek-harness\apps\cli`；该检出 HEAD `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`，`dsh-client-locale` / `dsh-host-webserver` / `agent-preset-registry` 同为 `0.2.2-rc.1`。
- 旧包 `0.10.0-rc.3.9` 声明 `engines.dsh = "0.2.1-rc.3 || 0.2.2-alpha.2"`；`semver.satisfies('0.2.2-rc.1', …, {includePrerelease:true})` 为 false。
- 门禁在 `packages/boot/app-boot/src/profile.ts:699-700` 抛错并**跳过整个 bundle**，`compatibility-preflight.ts` 再禁用条目，所以插件不会挂载。
- 附带发现：正式 web profile 的 `dsh.profile.bundles` 里已经没有 `dsh-worktable`，仅有依赖记录；改对版本后仍需重新注册。

## 决策

1. `engines.dsh` 从精确钉死改为**有界范围** `>=0.2.2-rc.1 <0.3.0-0`。上界必须带 `-0`：实测 `<0.3.0` 在预发布匹配下会放行 `0.3.0-alpha.1`。
2. 区分两个命题：**范围 = 放行承诺**；**verified matrix = 验证承诺**。两者不再用同一个版本号表达。
3. 打包门禁拆两层：不钉 commit 的 `runtime-surface.test.mjs` 永远跑；已知检出再追加钉 commit 的证据测试。新宿主让守卫变红时改插件，不放宽范围。
4. 新归档不再兼容更早的宿主线：`0.2.1-rc.3` / `0.2.2-alpha.2` 由各自的冻结归档承担，新归档明确拒绝（旧契约测试已改为断言拒绝）。

## 实际改动

| 文件 | 操作 |
| --- | --- |
| `01_content/package.json` | version → 0.10.0-rc.3.13；`engines.dsh` 与两个 peer 改为有界范围 |
| `01_content/dsh.plugin.json` | 版本同步 |
| `04_test/runtime-surface.test.mjs` | 新增：不钉 commit 的前向守卫（门禁版本一致、范围放行与拒绝、预设解析、5 层 Config） |
| `04_test/native-rc1-contracts.test.mjs` | 新增：钉 `fcc0ad46` 的 rc.1 证据，含范围上下游边界与精确豁免不越界 |
| `04_test/native-rc3-contracts.test.mjs` | 改：worktable 已拒绝 rc.3，改为断言拒绝；legacy 插件断言保留 |
| `04_test/native-alpha2-contracts.test.mjs` | 改：同上，alpha.2 改为断言拒绝 |
| `04_test/host-boot-evidence.mjs` | 新增：隔离 `DSH_HOME` 真实装包启动、认证/匿名探针、写证据 JSON |
| `01_content/release-prep.mjs` | 门禁支持 `WORKTABLE_NATIVE_RC1_ROOT`；surface 必跑 + 已知版本追加钉 commit 测试 |
| `01_content/src/index.ts` | 健康路由在**通过认证时**附带 `hostCapabilities`（公开端点不暴露内部服务） |
| `01_content/README.md` | 兼容段落改为范围语义 + verified matrix（与版本号解耦） |
| `AGENTS.md` | 新增「宿主兼容声明」规则；打包说明补门禁 |
| `02_process/worklogs/2026-11-07_worktable-rc1.md` | 本文件 |

## 验证结果

- 契约测试：`native-rc1-contracts` 9 项 + `runtime-surface` 10 项，全绿。
- `npm run pack`：404 项中 402 通过、2 项既有 SKIP、0 失败；9 文件结构、独立安装 import、工厂门禁、锚点 DOM、服务端数据目录均通过。
- 双资产同源 SHA-256：`bde0048314bb0b43f644eeacd3402bbaad85a0e139938a947058e91e0392edbf`（`dsh-worktable.tgz` 与版本化名一致）。
- 包内最终产物复核：tgz 里的 `package/package.json` 为 `0.10.0-rc.3.13` / `>=0.2.2-rc.1 <0.3.0-0`，`package/README.md` 为新兼容段落（不是源码，是解包内容）。
- 隔离启动（全新临时 `DSH_HOME`，宿主 `0.2.2-rc.1`）：`plugin add` 退出 0（未被版本门禁拒绝）；health 认证 200 且报告包内版本；受保护路由认证 200、匿名 401；stderr 无 `disabling profile plugin dsh-worktable`、无跳过 bundle。证据：`releases/v0.10.0-rc.3.13/host-boot-evidence.json`。
- 正式 profile：`plugin add` 把依赖从 rc.3.9 升到 rc.3.13（CLI 只装包、不写 bundle 列表，bundle 仍为禁用态）；用插件管理器 `set_bundle dsh-worktable enabled=true` 启用后热应用，`~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 已含 `dsh-worktable`。运行中的 3080 实测 `GET /api/worktable/health` → 200 `{"plugin":"dsh-worktable","version":"0.10.0-rc.3.13","ok":true}`，匿名响应不含 `hostCapabilities`（认证分级生效）。
- 安装过程中发现另一处不兼容（非本次范围）：`@deepseek-ai/dsh-tool-personal-learning@0.1.0-alpha.1` 声明 `engines.dsh: 0.2.2-alpha.2`，在 0.2.2-rc.1 上被门禁拒绝并保持禁用。

## 未验证 / 待办

- 正式 profile 已装 rc.3.13 并启用；**侧边栏页面验收尚未在浏览器里做**（需要刷新页面后人工确认工作台出现、可开项目）。
- 只验证了公开契约、启动与健康路由，不含模型驱动工作流、真实审批/子代理全链路、桌面端与 macOS。
- `project-notes` / `reading-statistics` / `bug-solver` 仍钉旧版本，在 0.2.2-rc.1 上会被门禁跳过；本版未改。
- `@deepseek-ai/dsh-tool-personal-learning@0.1.0-alpha.1` 同样被门禁拒绝（`engines.dsh: 0.2.2-alpha.2`），待单独适配。
- 中间尝试 `rc.3.10`（健康路由在公开端点暴露能力自检）、`rc.3.11`（随包 README 早于文档修订）、`rc.3.12`（能力探测把仅客户端存在的 `workspaces` 报成缺失）均作废：对应的 `releases/` 证据目录已删除，`01_content/dist/` 下保留本地构建残留、不用于发布。发布资产不可覆盖，故改用新版本号重打。

## 回滚

- 保留 `releases/v0.10.0-rc.3.9/` 资产不动；旧包在 0.2.2-rc.1 上本就会被门禁拒绝，实际回滚动作是从正式 profile 的 bundle 列表移除并恢复上一版 profile 记录。
