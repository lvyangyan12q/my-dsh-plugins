# 05: Better Sidebar 可选接入

**What to build:** 用户从 Better Sidebar Tab 访问同一工作台，没有该插件时也可正常使用主入口。

**Blocked by:** 03 工作台侧边栏入口与应用窗口。

**Status:** code-implemented; live-browser-acceptance-pending

- [ ] 可选适配通过公开注册接口并在卸载时清理。
- [ ] 两个入口共享数据和窗口，不重复创建会话。
- [ ] 兼容、缺席及停用三种环境验证通过，不兼容时明确提示。

## Implementation Evidence (2026-10-01)

Code and automated fixtures implement the first two acceptance items; their live integration acceptance remains pending. The third item is not checked because real installed-browser verification has not occurred. Base: stable ticket03 API merge `b944bbd`; branch `codex/better-sidebar-adapter`, isolated `better-sidebar` worktree. Read `docs/personal-workbench-spec.md`, `docs/workbench-design.md`, `docs/workbench-api.md`, actual DSH AGENTS/defensive-patterns, and outside `notes/integration-apis.md`. The requested nested spec/design/API path is represented by these three files in this checkout.

- Optional `ctx.inject(['betterSidebar'])` child registers a public `single` descriptor with `component/visible`, without any Better Sidebar runtime import. Compatibility requires exactly installed `0.24.1`, required features, and callable methods; future patches remain unknown. Unsupported providers expose localized official-sidebar status; absence preserves the official entry.
- Catalog metadata/preferences come from the existing workbench owner. All open actions call the same `ctx.personalWorkbench.openWorkspace/openApp`. Missing dependencies show reasons without disabling registered app access. No second registry, app view, Kaogong state, role, Agent or Session is created.
- Plain custom tabs use the bottom workbench. No `setSurface`, floating-window API or URL interceptor is used. Child disposal removes snapshot subscriptions, closes adapter tabs across observed scopes (including restored split tabs), and disposes the registration; reappearance contributes one descriptor. Public APIs do not enumerate unvisited inactive scopes, so persisted tabs there can only be discovered on subsequent scope snapshots.
- Real Cordis and official SlotRegistry tests use a fixture whose consumed methods/descriptors compile against installed `dsh-better-sidebar/client/service` declarations. They cover absent/compatible/unsupported, future patch/missing feature/function, disabled actions, unload/reload, multi-scope cleanup, hidden-view subscription cleanup, stale callbacks, shared instance/page/geometry and missing optional dependency recovery access. Existing built workspace UI tests retain actual exercise drafts/results through hide/minimize/close/reopen.

Validation against built DSH `0.2.0-rc.2` at `D:/programming/workspace/deepseek-harness`:

- External official `tsdown -c tsdown.config.ts`: Host/browser build passed.
- `DSH_SOURCE=... node scripts/check-source.mjs`, `--emit-types`, and `--check-consumer`: public type checks/declaration generation passed, including the fixture. Client API consumer checks also passed with the local Better Sidebar dependency junction removed.
- `node --import file:///D:/programming/workspace/deepseek-harness/node_modules/tsx/dist/esm/index.mjs --test tests/*.test.ts`: 25 passed (19 teacher, 5 workbench, 1 adapter lifecycle scenario).
- `node --test tests/artifact.test.mjs tests/workbench-ui.test.mjs tests/workbench-lifecycle.test.mjs`: 7 passed. Packaged client imports only React runtime modules; package manifest and exported client declaration require no Better Sidebar package. Artifact tests also passed with that package absent.
- `npm pack --ignore-scripts --json --pack-destination .checks --cache .checks/npm-cache`: passed, 15 publishable entries including both runtime faces and public declarations. Initial default npm cache write was sandbox-blocked; workspace-local cache resolved it without profile changes.

Residual acceptance: real Chrome desktop/narrow screenshots, public menu opening in the installed bottom workbench, real Kaogong state through both entries, and live disable/unload/reload with/without Better Sidebar. Pack creation and VM/DOM fixtures do not establish installed browser acceptance. No core, Kaogong, public workbench API, daily profile, session data or outside integration notes changed; no push.
