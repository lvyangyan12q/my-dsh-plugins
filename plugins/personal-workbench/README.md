# Personal Workbench

DSH Web `0.2.0-rc.2` application catalog and retained window workspace, rendering the official native conversation beneath an explicit Session provider. Install the prebuilt package through the [official release instructions](../../README.md#prebuilt-installation); keep normal hoisted `autoInstallPeers: false`. No custom chat or model-selection UI is supplied.

## Stable Contracts

Public Host role bindings register/read/ensure/retry/replace full application/instance/role/subject keys. Apps own personas, Skills and explicit role work directories. A durable intent captures the native Session identity and cwd; native persistence's public flush barrier precedes ready. Cold recovery resumes the same Session, not a replacement. Exact-key Skill assignments persist with revision checks and use the existing native tool-skill loader on later role turns.

The Client retains one application view per default instance across workspace/page transfers. Main Session selection remains unchanged by embedded conversations. Layout preferences are browser-owned; learning records and native Sessions are Host-owned. Discovery, assignments and historical Skill instruction evidence are distinct; assignment is not permanent activation or proof of a completed turn.

Kaogong remains optional and owns its own learning domains, endpoints, personas and teaching Skill. Workbench removal leaves those business records intact; reinstall can recover saved role associations and assignments. There is no Kaogong runtime peer workaround.

## Native sidebar sections

Full application navigation registers in the root `sidebar.sections` list after native Workspace browsing and before the existing footer. It keeps applications beneath Workbench and preserves separate Agent/Skill entries. The generic [native sidebar adaptation](../../compat/native-sidebar-sections/README.md) supplies this public seat on the reviewed rc.2 host; native menu handlers, Workspace ownership and footer CSS remain unchanged. Build verification rejects an unadapted host instead of targeting private CSS-module classes.

## Optional Better Sidebar

The official sidebar launcher works without Better Sidebar. The optional adapter targets exactly `0.24.1` with its public tab lifecycle, targeted open and state subscription capabilities. It registers a catalog tab using the same workbench owner, not duplicate app views or Sessions. Absence, unsupported capabilities and unload remain explicit.

Service fixtures cover absent/present/unsupported/unload/reload cases. They are not live browser acceptance. Both actual installed modes still require Chrome checks.

## Verification Boundaries

The root combined release checks pack actual archives, install using the official built CLI offline, verify bytes and public declarations, preserve synthetic native role IDs/Skill assignments, and exercise the actual native pre-step loader without a model call. See [ticket11 evidence](../../docs/ticket11-release-evidence.md), [role ownership](../../docs/ticket07-roles-evidence.md), [management](../../docs/ticket09-management-evidence.md) and [application API](../../docs/workbench-api.md).

Live native composer/streaming, tools, approval, questions, Stop, close-during-run and continued turns are pending. Desktop/narrow screenshots, image pixels, focus/overlap and no/with-sidebar acceptance remain blocked by Chrome transport. Ready Sessions and pre-step proposals do not satisfy those gates.

The generic role implementation, native Session ownership, model controls and permissions are unchanged by the release packaging work.

## Independent reusable capabilities

Agent and Skills libraries are independent of application catalogs. Managed Agent identity is stable (`id`), with native preset identity `my-dsh.<id>` exposed as `presetId`. Application role bindings are usage relations. Explicitly selecting a different Agent creates a new native Session, preserves the former Session IDs and rejects a stale selection. Other app-specific role preconditions, including required teaching Skills, remain enforced.

Managed Skills use the native Skill registry and `tool-skill` loader. Managed Agent assigned Skills are admitted through the native pre-step waterfall on user turns. Model delegation checks both Agent model-invocation permission and every assigned Skill's model-invocation permission. Native Skill calls reject names outside the managed Agent's assignment. Unbinding a role preserves the underlying Agent and historical native conversation; deleting a Skill used by an Agent or application assignment is rejected.

Models discover capabilities through `list_capabilities` and delegate one task through `run_agent`. The native Agent factory composes the requested preset before publication, inherits the native parent's model route and delegated sandbox policy, pins delegated approval to `never` using native helpers, enforces a maximum delegation depth of 1, and owns cancellation and quiescent disposal. Output remains in the native Session. Invocation metadata persists separately in `my_dsh_capabilities`; a restart marks previously running invocations failed rather than claiming completion. Native Skill tool outcomes are included in execution history.

`test:capabilities` uses the official built runtime with a deterministic model adapter. It verifies real preset composition, native tool discovery and dispatch, assigned Skill instructions, permission inheritance, disabled Agent invocation, a live model cancellation, child disposal, durable history replay, independent CRUD/reopen, stale revisions and role rebinding. Set `DSH_SOURCE` to the built official checkout before running it. These tests do not make external model requests.

## Application availability

The application center manages independently registered apps. Enable/disable is persisted in the Host domain personal_workbench_apps; local layout preferences remain separate. Disabled applications cannot be opened or focused, and their mounted owners become inactive without deletion of business data or native Sessions. Plugin disposal still removes its live registry and view entries.

Authenticated same-origin POST /api/personal-workbench/apps supports catalog and set-enabled (appId, enabled, expectedRevision). Missing records default to enabled at revision zero. Concurrent stale writes are rejected; refresh availability before retrying. The optional Host service personalWorkbenchApps exposes read, list, and setEnabled for later recipe integrations. Definitions can be registered by installed or runtime app providers; registration never resets availability. Client loading fails closed with a visible retry action.

Public contracts: src/app-lifecycle-api.ts. Targeted tests: app-lifecycle-host.test.mjs, app-lifecycle-client.test.ts, workbench-ui.test.mjs, workbench-lifecycle.test.mjs, native-navigation.test.mjs.
# Public display modules and installed data adapters

Client exports `DisplayStore`, `DisplayModule`, `DisplayModules`,
`registerDisplaySource`, and `registerRecipeTemplate`. Host
`ctx.personalWorkbenchRecipes.registerDataSource({appId,resource})` registers a
trusted installed source for preview/activation validation; unregistering makes
future preview/activation fail explicitly. It does not grant cross-app access.
The corresponding Client adapter uses the exact same app ID and resource.

```ts
import { DisplayStore, DisplayModules } from '@deepseek-ai/dsh-personal-workbench/client'
import type { DisplayData, DisplaySource } from '@deepseek-ai/dsh-personal-workbench/client'

const source: DisplaySource = {
  appId: 'my-app', resource: 'records', label: 'My application records',
  async load({ appId, instanceId, preview, signal }): Promise<DisplayData> {
    // Read this application's own domain through its authenticated route.
    // Adapt business records here; never place them into a recipe config.
    return {
      records: [{ id: 'stable-id', title: 'Item', subtitle: 'Optional',
        fields: { category: 'Example', minutes: 30, completed: true } }],
      filters: [{ field: 'category', label: 'Category' }],
      stats: [
        { id: 'count', label: 'Items', operation: 'count' },
        { id: 'total', label: 'Minutes', operation: 'sum', field: 'minutes' },
        { id: 'mean', label: 'Average minutes', operation: 'average', field: 'minutes' },
      ],
    }
  },
}
const store = new DisplayStore(source, {appId: 'my-app', instanceId: 'default', preview: false})
void store.reload()
// <DisplayModules store={store} t={t}/>
// Or <DisplayModule type="stats" store={store} t={t}/> for a single module.
// Dispose an application-owned store on its owner lifetime, not page switches.
```

`DisplayRecord.fields` contains only strings, finite numbers, booleans or null.
Filter fields compare exact values; search matches title/subtitle/fields.
All statistics use the filtered records. Numeric aggregation ignores nonnumeric
fields. Selection updates details and clears when the selected record leaves the
filtered set. `setFilter`, `setSearch`, `select`, `reload`, `getSnapshot`,
`subscribe`, and `dispose` are public Store methods. Loading, source failure,
empty data, no matches and no selection have distinct visible states. No module
or store calls a Session or model service.

Recipe renderers share an owner keyed by app ID, instance ID, preview flag and
connection ID, across pages. Preview uses its own interaction state. Direct
application integration (including Kaogong) should create one Store per app
instance and pass the same Store to each public component. Installed specialized
modules continue to register through `registerRecipeModuleRenderer`; recipes
reference a code-owned module ID and scalar configuration, never executable code.

The independent `plugins/reading-statistics` package supplies its own Host domain,
adapter and template, with package/profile setup documented in its README. The
ordinary recipe connection form lists only sources installed for that recipe's
own app identity. Templates prepare drafts; saving, previewing and explicitly
activating remain separate actions.


## Prepared module tasks and recipe roles

`ctx.personalWorkbenchTasks.prepare({ key, task, source, context, teaching? }, { afterSend? })` stores a pending task under the complete application instance and role key. Source contains `pageId`, `moduleId` and `label`; context chunks contain `id`, `label`, `source` and `text`. Preparation, editing, removal and page selection do not ensure a Session or send a model request. `PreparedTaskEditor` exposes the pending task; explicit `send(key)` uses the edited text and remaining context in that role's exact native conversation scope. Context is serialized as user evidence with escaped slash gestures.

For trusted application teaching, use `teaching: true`. The Host action named `prepare-teaching` includes native binding ensure and is **only called by the explicit send driver**, never by `personalWorkbenchTasks.prepare`. It validates the application-declared teaching Skill's provider and readable body using the existing teaching contract, then supplies its controlled Skill gesture. All business material and submitted exercise results belong in visible context chunks; no original evidence is secretly appended after editing or removal. `afterSend` runs only after native sending succeeds. A completion callback failure does not restore the already sent task, preventing accidental duplicate submission.

Recipe role declarations and trusted Host workspace locations are restored from the instance domain. Registration and read-only capability preflight do not create a native Session. The existing role-binding domain retains current and prior Session IDs. Editing a recipe's Agent declaration creates its replacement only on explicit ensure/send; management-selected Agents retain their independent binding selection. Role Skills are loaded through the native Skill loader in the matched role Session. Disabled applications, missing or non-user-invocable Agents/Skills fail explicitly.

Storage domains have a single owner. Capability readers use `withCapabilityCatalog(ctx, visit)` and the owner-provided `ctx.personalWorkbenchCapabilities` (`agents()` and `skill(name)`) instead of reopening the management capability domain. `test:handoff` covers task behavior, built Client interaction, real Host restart and invalid editable configuration; native loader/Agent-loop regression tests remain in the management and capability suites.

## Native application generation

The recipe editor accepts requirements in Chinese or English and starts a dedicated native Session through Session Controller. The configured provider, model and reasoning effort are resolved by the native controller. A trusted generator preset exposes no tools and denies global, scoped, dynamic and nested tool execution; native policy hooks remain active. Only completed text JSON that passes the current recipe schema, registered module/data/role/Skill validation and revision CAS is saved as a draft. Generation never activates an application. Review and edit the draft, preview it, then explicitly activate. Cancel calls the real Agent cancellation API; service disposal cancels active work and waits for native idle before unregistering its preset. Finished generator Sessions remain native audit history under Controller ownership.

Generation jobs are bounded in-memory observations; completed drafts use the durable recipe domain. A page hide does not cancel native work. On a full page reload, a completed draft is available in the recipe catalogue. A server restart may lose job observation; it does not convert partial output to a saved draft. The UI shows failure diagnostics and the native Session ID. The commit phase rejects cancellation once it has begun to prevent reporting cancellation after a draft was committed.

Run `test:generation` with `DSH_SOURCE` pointing to a built official checkout. Its MockAdapter tests run real native Agent/Session Controller/Loop/preset/tool boundaries, without contacting a provider. They are integration evidence; real provider browser acceptance is separate.

Module task context is captured by installed code through `registerRecipeModuleContextProvider(type, props => ({ phase: 'ready', context }))`, or an explicit `{ phase: 'unavailable', reason }`. Providers read their owned state and never ensure/send Sessions; recipes contain no provider functions. Capture happens at explicit preparation and is frozen in the editable pending task. The public display providers use the same app/instance/connection store as their rendering: source, current filters/search, selected record and current statistics. Unselected lists expose a labelled sample of at most three records. Selection fields, strings and statistics are bounded; the platform limits captured context to at most 20 chunks and 16,000 text characters. Missing providers/data fail with a visible reason. Configured text is supplementary context within the same limits.

Recipe roles select an installed Agent by display name from the independent management catalog and save its exact native `presetId`. Missing or disabled saved references remain visible, rather than being replaced or guessed from an Agent's short identifier. Catalog refresh and role selection issue no native Session command.

Native Team and Schedule services intentionally hydrate tools in an Agent's own registry layer, which inherited capability restrictions exempt. The trusted generator preset narrows the official scoped prompt-assembly tool surface to empty; admission checks that effective surface. A monotonic execution guard still denies registry tools, including late and nested calls. The native integration fixture loads the actual Team, Schedule, Subagent and JSONL persistence plugins and verifies both surfaces and execution denials.

## Embedded native Session navigation

Role modules render DSH's conversation body and Session chrome under the same retained SessionProvider. The current rc.2 source runtime needs the reviewed native-session-chrome adaptation shipped in this repository; see [adapter installation and checks](../../compat/native-session-chrome/README.md). Release builds verify the source adaptation and fail explicitly on missing or conflicting changes. Native Chat, Trajectory, tool and approval rendering stay owned by DSH. Read-only opening and navigation never send model tasks. Runtime acceptance of real tools and approvals remains separate from component and registry tests.

### 工作台自带页面 Skills

插件包携带 skills 目录，通过 DSH 原生 bundled filesystem provider 加载 workbench-module-generate、workbench-page-adjust、workbench-data-display 和 workbench-app-build。skills/shared/module-template.html 是统一页面样式参考。工作台自有“应用搭建”角色使用原生文件和 Skill 工具，继续遵循所绑定 Session 的权限及审批策略；它不写入公共 Agent 管理目录，不迁移应用已有私有能力。

自定义生成模块可在模块内创建该角色。准备任务仅建立可编辑上下文；显式发送时调用对应 Skill。继续修改使用新的请求输出文件，并提供前一个产物路径供读取，保留原文件。实际生成、修改、显示恢复及审批仍须在宿主中完成验收。

## Optional sidebar retirement

Better Sidebar 0.24.1 catalogs use the rc.2 published `Context.sidebarRight.openTabs` and `closeIn` contract to retire only `personal-workbench.catalog` records. The observer belongs to Workbench, outside the optional provider view lifetime. Other tab kinds, native Sessions and application data remain untouched.

Unadopted saved layouts cannot be changed by `closeIn`. Workbench stores bounded, versioned retirement identities in its own browser key, and retries on public inventory and mounted-session changes. Entering a retired session permits cleanup; successful removal is verified from inventory. Newly created catalog ids are not retirement targets. Pending or unavailable-storage recovery is displayed explicitly. This does not guarantee immediate cleanup of dormant sessions or continued cleanup while Workbench itself is unloaded.
