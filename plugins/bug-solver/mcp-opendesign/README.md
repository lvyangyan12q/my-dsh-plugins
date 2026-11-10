# OpenDesign MCP 连接（DSH 配置型 bundle）

把本机 OpenDesign 桌面端的 stdio MCP 服务接到 DSH profile（`web`），使**所有会话**都能直接使用
`mcp__opendesign__*` 工具与 `od://` 资源（skills、design systems、active context）。

## 本机实况（2026-11-07）

| 项 | 值 |
|---|---|
| 安装路径 | `D:\programming\Open Design\Open Design.exe`（0.26.1，stable 通道） |
| daemon CLI | `D:\programming\Open Design\resources\app\prebundled\daemon\daemon-cli.mjs` |
| 数据目录 | `D:\programming\openDesignData` |
| 安装方式 | `plugin_manager install_bundle` → profile 里是 `link:` 到本目录 |
| profile | `web`，已加入 `dsh.profile.bundles` |

## 管道名是算出来的，不是随机的

`@open-design/sidecar` 的 `resolvePrivateIpcPath`：

```
digest = sha256(`${username}\n` + `channel=..\nnamespace=..\nsource=..\nmode=..\napp=..`).hex[0:32]
endpoint = \\.\pipe\open-design-sidecar-<digest>
```

本机 `username=pc-zzy`、`channel=stable`、`namespace=release-stable-win`、`source=packaged`：

| app | mode | digest |
|---|---|---|
| daemon | runtime | `d04833fe5d36bf8226bcf2201ca36e97` |
| daemon | headless | `384aa4a05b0c6e92b329f3a092f220af` |
| desktop | runtime | `0da43bf1b82bcfde0fb84bce5dae821d` |
| desktop | headless | `c64b2b11a33e4cff5686447678369d3d` |

用户名、通道或 namespace 变化后要重算；直接从 `%APPDATA%\Open Design\launcher\...\install.json`
读 `launchPath` 与 `namespace` 即可确认。

## 为什么用 managed discovery

`OD_MCP_BOOTSTRAP_ARGS` 里带 `--od-mcp-managed` 时，MCP 会解析 `OD_MCP_DISCOVERY`
（`daemon` 与 `desktop` 都必须是非空数组），逐个探测端点：

- OpenDesign 已在运行 → 直接连它的 app 自有管道；
- 没在运行 → 由 `OD_MCP_BOOTSTRAP_COMMAND` 拉起 headless 实例，再连 headless 管道。

所以四个端点全列上，两种状态都能连；不用再手工抄管道名。

## 验证

- `plugin_manager install_bundle` 返回 `application: applied`
- 本会话已出现 `mcp__opendesign__*` 工具（22 个），`list_projects` 正常返回
- `get_project` 返回可打开的 `previewUrl` / `studioUrl`
- 三个原型项目 `learning-teach-a/b/c` 已写入 `index.html`

## 注意

- `link:` 依赖指向本仓库目录：移动或删除 `plugins/bug-solver/mcp-opendesign` 会让 profile 失效。
- OpenDesign 升级后若 `source` 标记变化，四个 digest 会变，需要重算并重载。
- `failOnStartupError: false`：OpenDesign 未安装时只是没有工具，不会拖垮宿主启动。
