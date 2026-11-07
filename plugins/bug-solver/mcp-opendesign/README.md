# OpenDesign MCP 连接（DSH 配置型 bundle）

把本机 OpenDesign 桌面端的 stdio MCP 服务接到当前 DSH profile（`web`）。
安装后 Agent 会多出 `mcp__opendesign__*` 工具，以及 `od://` 资源（skills、design systems、active context）。

## 文件

| 文件 | 作用 |
|---|---|
| `cordis.patch.yml` | 插入一行 `@deepseek-ai/dsh-mcp-client`，`serverName: opendesign` |
| `package.json` | bundle 清单（`dsh.bundle.patch`）与展示资源导出 |
| `locale/en.json`、`locale/zh.json` | 插件管理页显示的名称与说明 |
| `icon.svg` | 自绘图标（原创，可自由分发） |

安装：`plugin_manager` → `install_bundle`，target 为本目录的绝对路径。改了 patch 之后需要
`set_bundle` 关闭再开启，才会重新加载这一行配置。

## 配置说明

| 环境变量 | 值 | 作用 |
|---|---|---|
| `ELECTRON_RUN_AS_NODE` | `1` | 让 `Open Design.exe` 以 Node 方式运行 `daemon-cli.mjs` |
| `OD_DATA_DIR` | `F:\OpenDesignData` | MCP 侧工作区/简报存储；**应用未启动时**由它拉起的 headless 实例也用它做数据根 |
| `OD_SIDECAR_CLIENT_ENDPOINT` | `\\.\pipe\open-design-sidecar-045b8740...` | 桌面端正常运行时 daemon sidecar 的命名管道 |
| `OD_MCP_DISCOVERY` | `{"daemon":[…],"desktop":[…]}` | managed 发现：同时接受「应用自己启动」和「MCP 拉起 headless」两种模式的管道 |
| `OD_MCP_BOOTSTRAP_COMMAND/ARGS` | `Open Design.exe --headless --od-mcp-managed` | 应用没在运行时，由 MCP 拉起 headless 实例 |

管道名不是随机值，而是
`sha256("<用户名>\nchannel=…\nnamespace=…\nsource=…\nmode=…\napp=…")` 的前 32 位十六进制：

- `mode=runtime, app=daemon` → `045b8740d8210acc67a7c4f97f9c9975`（桌面端正常启动，当前使用的首选端点）
- `mode=headless, app=daemon` → `aa28d0c6bdfe237f3de5abf70a9768f6`（MCP 拉起 headless 时）
- desktop 管道同理：`runtime` = `63690268…`，`headless` = `52bd531a…`

OpenDesign 升级后若命名空间/来源标记变化，管道名会失效：此时把这些常量重新算一遍，或直接从
OpenDesign 重新生成的 Claude Code 注册里抄一份新管道名替换。

## 验证状态

- `install_bundle` 返回 `application: applied`
- 连接成功：`list_mcp_resources(server: "opendesign")` 返回 skills / design systems 资源
- 工具可真实执行：`mcp__opendesign__get_active_context` 返回当前活动上下文
- 图形界面里的标题/图标渲染未在浏览器中人工确认
