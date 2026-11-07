# 01 调研：窗口3「派发」→ 目标仓库启动原生会话

> **运行时更正（2026-10-27，已实测）**：真实窗口3 iframe 的普通 `fetch` 调 `connection.fetch` 路由会返回 **400**（没有客户端 RPC Peer）。已改为 `ctx.webServer.register` 的 exact 路由 + `connection.admit(req)`（工作台同款），Node req/res 适配见 `bridge/lib/node-http.js`。本报告第 1/2 条与示例代码以此为准；`sessionController/workspaceRegistry` 等其余结论不变。

**范围**：只读调研。依据 DSH checkout `F:\ai-project\deepseek-harness`（下称 DSH）、已安装
`C:\Users\Administrator\.dsh\profiles\web\node_modules\dsh-worktable\lib\index.js`（下称 WT）与
`.../dsh-worktable/lib/client.js`（下称 WTC）。未在 window3/桥插件内实跑，标注「未验证」的均属推断。

## 结论

1. **最小可行 = 单文件 Host 插件**（ESM JS，无需构建），用 `ctx.connection.fetch.register` 暴露
   `POST /api/bug-solver/dispatch`；内部四步：`workspaceRegistry.create` → `sessionController.create` →
   `rename` / `permissionPresets.set` → `prompt`。约 100–150 行，零运行时依赖。
2. **不要用 `ctx.webServer.register` + 手工 `connection.admit`**：exact Fetch 路由挂在 `/api` 共享通道上，
   已经过 Host/Origin + 浏览器 cookie 认证，且只放行 owner Peer（`rpc-host.ts:207–231, 245–250`）。
   WT 用 `webServer.register` + `admit` 是因为它要复用既有 `/api/worktable/*` 路由形态（WT `2009–2019, 2082–2091`）。
3. **目标目录必须是已存在的绝对路径**。`workspaceRegistry.create(path)` 做 `realpath`，拒绝相对/不存在/非目录，
   同一 canonical path 幂等复用（`workspace/src/index.ts:222–244, 510–513`）；会话 cwd 即 `workspace.path`
   （`commands.ts:117`，`agent.ts:447–459`），创建时自动 `attachSession`（`commands.ts:131–141`）。
4. **会话会实时出现在 GUI**：`session/created → api-session/added`（`session-controller/src/index.ts:212–224`）
   经转发白名单（`packages/api/remotes/src/remote-events.ts:30`）到客户端列表（client `index.ts:116`）；
   新 workspace 经 `domain/changed` 推送 `upsert`/`order`（`workspace-controller/src/feed.ts:64, 101–118`）。
5. **Host 侧无法让 GUI 自动切到新会话**：`uiWorkspace.openSession` 是纯客户端服务（`ui-workspace/src/client/navigation.ts:195, 293`）。
   WTC 在 `handoff-open` 后由客户端自己调（WTC `7880–7885, 11586`）。窗口3 若与主窗口同源且无 sandbox，
   可试 `window.top.__dshOpenSession(id)`（WTC `27323` 暴露的调试全局，未验证/非正式契约）。
6. **另有一条零插件通道**：GUI 自己用的通用 Remote HTTP（`POST /api/session/create` 等），属内部协议（见末节）。
7. **不推荐**走 WT 的 roles/tasks：tasks 只服务 deep application（WT `2826, 3052`），roles 要求 workspace 已注册且
   binding ready（WT `3717–3721, 2830–2831`）。窗口3 是 web/iframe，改 deep app 的成本远大于本插件。

## 推荐实现

目录（可直接 `file:` 安装）：`package.json` + `cordis.patch.yml` + `lib/index.js`。

```json
{ "name": "bug-solver-dispatch", "version": "0.1.0", "type": "module", "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./package.json": "./package.json" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "engines": { "node": ">=22", "dsh": "0.2.1-rc.3" },
  "peerDependencies": { "@deepseek-ai/cordis": "*" },
  "peerDependenciesMeta": { "@deepseek-ai/cordis": { "optional": true } } }
```

```yaml
- insert:
    - id: bug-solver-dispatch
      name: bug-solver-dispatch
```

```js
import { basename, isAbsolute } from 'node:path'
export const name = 'bug-solver-dispatch'
export const inject = ['connection']
export function apply(ctx) {
  ctx.inject(['connection', 'sessionController', 'workspaceRegistry', 'permissionPresets'],
    child => child.effect(() => child.connection.fetch.register({
      path: '/api/bug-solver/dispatch', methods: ['POST'], requestBody: 'buffered',
      fetch: request => dispatch(child, request),
    }), 'bug-solver dispatch route'))
}
async function dispatch(ctx, request) {
  let body; try { body = await request.json() } catch { return json(400, { code: 'bad-json' }) }
  const cwd = body?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return json(400, { code: 'bad-path' })
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 64_000)
    return json(400, { code: 'bad-prompt' })
  let workspace, created
  try {
    workspace = await ctx.workspaceRegistry.create(cwd)            // 已存在目录；按 canonical path 幂等
    created = await ctx.sessionController.create({ workspaceId: workspace.id,
      ...(body.agentPreset ? { agentPreset: body.agentPreset } : {}) })  // 不能同时给 cwd
  } catch (error) { return json(409, { code: 'create-failed', error: String(error?.message ?? error) }) }
  const sessionId = created.sessionId
  try {
    await ctx.sessionController.rename({ sessionId, title: body.title || `bug-solver · ${basename(cwd)}` })
    if (body.permissionPreset) {
      ctx.permissionPresets.resolve(body.permissionPreset)         // 先校验，未知 preset 直接 400/409
      const found = await ctx.sessionController.resolveAgent(sessionId)
      if ('agent' in found) ctx.permissionPresets.set(found.agent.session, body.permissionPreset)
    }
    await ctx.sessionController.prompt({ sessionId, requestId: crypto.randomUUID(), mode: 'queue',
      content: [{ type: 'text', text: body.prompt }] }, AbortSignal.timeout(15_000))
  } catch (error) {                                               // 会话已发布：不假装没发生
    return json(502, { code: 'delivered-unknown', sessionId, error: String(error?.message ?? error) })
  }
  return Response.json({ sessionId, workspaceId: workspace.id })
}
const json = (status, value) => Response.json(value, { status })
```

请求契约：`{cwd, prompt, title?, agentPreset?, permissionPreset?}`；响应：`{sessionId, workspaceId}`。
补充：`sessionPersistence.flush()`（`session-persistence/src/index.ts:187`）可在 create 后显式落盘，
避免紧接着的列表/标题读取与持久化竞争（WT 角色创建即如此，WT `3784`）。

## 关键 API 依据

| 用途 | 调用 | 位置 |
|---|---|---|
| 注册 POST 路由（已鉴权） | `ctx.connection.fetch.register({path, methods, requestBody, fetch})` | `client/connection/src/rpc.ts:152–176`；`rpc-host.ts:234–251` |
| 认证/鉴权语义 | owner-only；cookie `HttpOnly; SameSite=Strict`；Origin 为 `null` 拒绝 | `rpc-host.ts:207–231`；`browser-auth.ts:138`；`api-request-trust.ts:147–150` |
| 取/建 workspace | `create(path)`、`resolveByPath`、`list()`、`archiveSession` | `workspace/src/index.ts:238–244, 502–508, 292, 365–387` |
| 建会话 | `create({workspaceId|cwd, sessionId?, agentPreset?})`，二者互斥 | `commands.ts:104–143`；`types.ts:259–276` |
| 会话 cwd | `workspace.path ?? request.cwd ?? process.cwd()`；无 workspace 时 `mkdir` | `commands.ts:117`；`agent.ts:443–459` |
| 默认 preset | `agentPresets.resolve(undefined)` → `defaultId` | `preset/agent-preset-registry/src/index.ts:81–82, 220–227` |
| 权限 preset | 新会话自动 pin 默认；`set(session,name)` 覆盖，`resolve` 校验 | `permission-presets/src/index.ts:231–235, 369, 398, 429–445` |
| 模型默认 | `agentDefaultModel.currentSelection()`；覆盖用 `selectModel` | `agent.ts:464–472`；`commands.ts:150–179` |
| 标题 | create 无 title 字段；`rename` 用 `sessionTitle`，显式标题会压掉自动生成 | `commands.ts:186–205`；`session-title/src/index.ts:400–431` |
| prompt | `{requestId, sessionId, mode:'queue'|'steer', content}`；文本块 | `index.ts:451–476`；`types.ts:77–85, 314–323` |
| 原会话回滚 | 无删除 API；`cancel({sessionId})`、`archiveSession` | `index.ts:503–504`；`workspace/src/index.ts:365–387` |
| GUI 列表 | `api-session/added` 事件转发 + 客户端 handler | `session-controller/src/index.ts:212–224`；`remotes/src/remote-events.ts:30` |
| 自动打开 | 仅客户端 `uiWorkspace`；WTC 在客户端调 | `ui-workspace/src/client/navigation.ts:195, 293`；WTC `7880–7885` |
| WT 角色/任务 | role create 传 workspaceId；task 仅 deep app | WT `3774–3787, 2826, 3052` |

## 安装步骤

1. 把上面三文件放进插件目录，`lib/index.js` 用纯 ESM JS（无需 tsc/tsdown）。
2. 安装：`dsh plugin --profile web add file:<绝对目录或 tgz>`；CLI 走 pnpm 并复用同一实现
   （`apps/cli/src/plugin.ts:71–98`）。包声明了 `dsh.bundle`，安装成功后会自动把包名追加进
   `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`（`plugin-manager/src/operations.ts:89–114`）。
   当前该文件 bundles 为 `@deepseek-ai/dsh-base`、`dsh-web-app`、agent-team、auto-review、`dsh-worktable`。
3. 发布形态：本地目录 `file:` 适合联调；交付用 `pnpm pack` 的 tgz，与现有 `dsh-worktable` 的 `file:...tgz` 一致。
4. 重启当前 `dsh web`（提供 127.0.0.1:3080 的进程）。`dsh-base` 组合了 host HMR
   （`apps/cli/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:28–29`），理论上 HMR watcher 可重新对账 profile
   （`packages/boot/hmr/src/index.ts:384–407`），但 CLI 安装发生在 manager 之外，**是否热加载未验证**；重启最稳。
5. 验证（在 window3 控制台）：`await fetch('/api/bug-solver/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cwd:'F:\\repo',prompt:'hi'})})`；
   预期 200 且响应含 sessionId，GUI 会话列表/workspace 侧栏随即出现新行。

## 风险与未验证项

- **零插件直连 Remote（重要备选）**：GUI 的通用通道是 `POST /api/<namespace>/<method>`，body 形如
  `{type:'client-request', rpcId, method:'session/create', payload:{args:{request:{cwd}}}}`
  （`client/connection/src/rpc-schema.ts:35–40`；`gateway/src/index.ts:1263–1272`；单参方法参数名为 `request`，
  见 `session-controller/tests/remote-access.host.spec.ts:124`）。可调 `session/create`、`session/rename`、
  `session/prompt`、`workspace/create`（`workspace-controller/src/index.ts:90–93`）。**这是内部协议、未文档化**，
  随 DSH 升级可能变；适合先验证 UX，不宜作为长期契约（本报告仍推荐小插件固化路径）。
- **自动打开**：`window.top.__dshOpenSession` 依赖 window3 与主窗口同源且 iframe 未加 sandbox。WT 的
  `IframePane` 无 sandbox（WTC `21359–21360`），而“网站应用”用 `WEBSITE_SANDBOX`（无 `allow-same-origin`，WTC `10039`），
  后者连 cookie 都带不上；既然现状 fetch 同源可用，窗口3 大概率是前者，但 `__dshOpenSession` 是否仍在**未验证**。
- **回滚不是删除**：DSH 无公开删除会话 API；create 成功后 prompt 失败只能 `cancel`/`archiveSession`，
  空会话仍留在历史/列表中。建议照 WT：返回 `delivered-unknown` + sessionId，不自动重发（WT `2908–2914`）。
  `create` 抛错时不要猜结果，WT 记为 `creation-unknown` 且不自动重试（WT `3776–3783`）。
- **workspace 副作用**：`create(path)` 会把任意绝对路径登记为 workspace。建议插件加 `allowedRoots` 配置，
  `realpath` 后做前缀校验，拒绝非仓库目录。
- **参数互斥/重复**：`create` 同时给 `workspaceId` 和 `cwd` 会抛 `gateway/bad-request`（`commands.ts:105–107`）；
  用 `workspaceId` 后不要再手工 `attachSession`（create 已 attach）。
- **占用与冲突**：路由 path 重复注册会抛错（`rpc-host.ts:245–247`）；插件 id/path 需全局唯一。
- **版本锁**：`engines.dsh` 需匹配运行时 `0.2.1-rc.3`（`apps/cli/package.json`），否则安装被兼容性检查拦下
  （`plugin-manager/src/index.ts` 兼容性路径）。升级 DSH 后要同步升插件版本。
- **未验证**：Host HMR 能否热加载新装插件；`window.top.__dshOpenSession` 在目标窗口可用性；在真实
  window3 中 cookie/Origin 行为（目前只有“同源 fetch 可用”这一前提）。
