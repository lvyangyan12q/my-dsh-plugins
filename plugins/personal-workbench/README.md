# Personal Workbench

DSH Web `0.2.0-rc.2` application catalog and retained window workspace, rendering the official native conversation beneath an explicit Session provider. Install the prebuilt package through the [official release instructions](../../README.md#prebuilt-installation); keep normal hoisted `autoInstallPeers: false`. No custom chat or model-selection UI is supplied.

## Stable Contracts

Public Host role bindings register/read/ensure/retry/replace full application/instance/role/subject keys. Apps own personas, Skills and explicit role work directories. A durable intent captures the native Session identity and cwd; native persistence's public flush barrier precedes ready. Cold recovery resumes the same Session, not a replacement. Exact-key Skill assignments persist with revision checks and use the existing native tool-skill loader on later role turns.

The Client retains one application view per default instance across workspace/page transfers. Main Session selection remains unchanged by embedded conversations. Layout preferences are browser-owned; learning records and native Sessions are Host-owned. Discovery, assignments and historical Skill instruction evidence are distinct; assignment is not permanent activation or proof of a completed turn.

Kaogong remains optional and owns its own learning domains, endpoints, personas and teaching Skill. Workbench removal leaves those business records intact; reinstall can recover saved role associations and assignments. There is no Kaogong runtime peer workaround.

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
