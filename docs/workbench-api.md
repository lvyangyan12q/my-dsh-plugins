# Workbench Client API

Ticket 07 stabilizes generic per-key role declarations and retained native views. See [role contract and evidence](ticket07-roles-evidence.md) for app-owned presets, subject keys, explicit creation cwd and the native header durability barrier. `personalWorkbenchBindings.registerRole` and Client `personalWorkbenchRoles.ensure` are additive; the registry contract below is unchanged.

Ticket 06 adds the separate optional Host/Client binding typeface in `plugins/personal-workbench/src/role-binding-api.ts`. See [fixed teacher contract and evidence](ticket06-classroom-evidence.md) for `personalWorkbenchBindings`, `personalWorkbenchRoles` and the native `personal-workbench.role-conversation` factory. The base application registry contract below is unchanged.

Ticket 03 code-first implementation, not live accepted. The public type entry is `@deepseek-ai/dsh-personal-workbench/client`; declarations originate in `plugins/personal-workbench/src/workbench-api.ts`. Ticket 04/05 can consume these names without a runtime import.

`ctx.personalWorkbench` exposes `registerApp(definition): () => void`, `openApp(appId, instanceId?)`, and `openWorkspace()`. Types: `PersonalWorkbench`, `WorkbenchAppDefinition`, `WorkbenchAppPage`, `WorkbenchAppProps`, `WorkbenchAppOwner`, `WorkbenchAppId`, `WorkbenchInstanceId`, and `WorkbenchIcon`. IDs are branded strings; applications choose stable namespaced app IDs and their own instance IDs. The omitted instance ID is `default`.

An application registers its current installed name/version/source/icon, pages and default width/height/page ID, plus optional role and dependency metadata. The workbench accepts only actual registrations, rejects duplicate app IDs and duplicate page IDs, and reports a missing view explicitly. Roles are declarations only; this ticket creates no role associations, Sessions or model calls.

The workbench owns and declares `personal-workbench.app`, a root-scoped keyed slot. The application registers with `key: appId`; the workbench dispatches using the official `renderSlot` option `entryKey: appId`. Its owner props are `appId`, `instanceId`, `pageId`, `active`, `selectPage(pageId)`, and `close()`. Compose `WorkbenchAppProps` with the application's own inject/locale/render shares. Register the view and metadata within the optional injected child's effects, not as a value import or ReactNode field.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { WorkbenchAppId, WorkbenchAppDefinition } from '@deepseek-ai/dsh-personal-workbench/client'

const appId = 'kaogong' as WorkbenchAppId
// Kaogong owns its component and locale-resolved metadata.
function integrate(ctx: Context, definition: WorkbenchAppDefinition) {
  ctx.inject(['personalWorkbench', 'slots'], child => {
    child.slots.inject('personal-workbench.app', () => {
      const removeView = child.slots.register({ name: 'personal-workbench.app', key: appId }, KaogongWorkbenchView)
      let removeApp: () => void
      try { removeApp = child.personalWorkbench.registerApp(definition) }
      catch (error) { removeView(); throw error }
      return () => { removeApp(); removeView() }
    })
  })
}
```

The snippet uses application-owned `KaogongWorkbenchView`; it is not a workbench export. Kaogong retains its standalone entry and owns transfer/persistence when an optional integration disappears. The Better Sidebar adapter calls the same service from its public descriptor component; `single` only deduplicates within its sidebar scope. Neither adapter creates a second registry or window-state owner.

Opening an existing app/instance restores and focuses the same window. Closed/minimized/inactive windows and a closed workspace retain application components while their registration stays live, with `active: false`. This preserves component-local practice and drafts during UI transitions. Applications gate visible work/subscriptions using `active`, without using it to cancel a Session. Registration disposal unmounts retired application views; applications own durable business state before disposal, refresh or Host restart. Layout persistence is not evidence of business-data persistence.

Only browser UI preferences are persisted: stable app/instance/page IDs, geometry, window mode, workspace visibility, favorites, hidden state and order. Definitions, components, roles, credentials and Session IDs are never persisted by this service. Restored references resolve against current registrations, unknown app IDs are not rendered, and removed page IDs resolve to the current declared default. Storage failures expose a localized status and leave current UI usable.

The official sidebar footer and additive `shell.overlay` are the only DSH UI insertion points. The workspace is nonmodal, supports keyboard buttons, Ctrl+F6 window cycling, arrow-key movement on the title handle, and Escape only on the workspace itself. Native application keyboard events are not intercepted. Dimensions resolve inside the measured workspace area; narrow layouts use a single visible application pane. Closing returns focus to its catalog entry or the prior connected outside element. The separate FlaskConical teacher launcher is explicitly a verification tool and retains the native proof's original Session ownership.

Automated tests use the built browser entry, registered test exercise views, and the documented observable/slot props. They check draft/submission preservation, UI lifecycle, registry uniqueness, restoration, disposal and native factory delegation. They supply no chat substitute and do not constitute native Host/Chrome acceptance. Desktop/narrow screenshots, real registered Kaogong and with/without Better Sidebar, native tools/approval/questions, running-session continuation and installed UI lifecycle remain release gates.
