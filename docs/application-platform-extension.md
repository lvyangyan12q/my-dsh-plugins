# Application platform extension workflow

Build against the already-built official DSH `0.2.0-rc.2` runtime. Install Workbench before dependent application packages through the official plugin manager/CLI and apply each package bundle patch. Native DSH peers use the exact runtime version. Workbench is an independent optional package dependency; putting its `0.1.0` version in DSH runtime peers causes the official compatibility gate to reject it.

1. Own business records in an application storage domain and authenticated same-origin route. Use stable app, instance and record IDs; `read` must not seed or mutate records. Explicit initialization belongs to the application. Keep credentials, source files and business records out of recipes and release archives.
2. Register the Host source through `ctx.personalWorkbenchRecipes.registerDataSource({ appId, resource })`, and the matching Client adapter through `registerDisplaySource({ appId, resource, label, load })`. Source withdrawal must run on owner disposal. Current recipes support their own application's registered data; an arbitrary cross-app connection is rejected.
3. Adapt records to `DisplayData` and share one `DisplayStore` per application/instance/connection. Use the public `filter`, `stats`, `list`, and `detail` renderers. Filters update both list and statistics; selection updates detail. Preserve loading, failure, empty, no matches and no selection states. Preview owns separate interaction state and cannot initialize data.
4. Register a template with `registerRecipeTemplate`. Its `create` returns schema-version-1 `AppRecipe`: registered modules, scalar configuration, owned connections, stable role IDs and native Agent preset IDs. Installed custom modules need both Host `registerModule` validation and Client `registerRecipeModuleRenderer`. Unknown modules/sources/presets/Skills refuse preview and activation. Save with the observed revision, preview, then explicitly activate. Failed/stale drafts leave the prior running version intact.
5. A module task uses `registerRecipeModuleContextProvider` to capture its actual owned state when the user prepares the task. Return visible context chunks or an explicit unavailable reason. Shared display modules already capture filters, selection and bounded summaries. Capture creates no Session and sends no request. Show `PreparedTaskEditor`; users may edit/remove evidence before explicit send. The role key includes app ID, instance ID, role ID and optional subject. Repeated pages share that role; other instances stay isolated. Agent replacement archives prior Session IDs rather than rewriting history.
6. Requirements generation uses native Session Controller and the configured provider/model. Only validated complete JSON saves a draft; tools are guarded and output never auto-activates. MockAdapter tests verify native failure/cancel/schema/CAS boundaries. Only an actual configured-provider turn establishes live provider acceptance.

The installed-type consumer in `tests/installed-consumer.ts` compiles these public contracts without source or tsconfig path mappings. Workbench README contains concrete adapter and prepared-task API examples. `plugins/reading-statistics` is the independent complete application example; `plugins/kaogong` demonstrates reuse in an existing application with retained learning domains.

From the repository root in PowerShell:

```powershell
$env:DSH_SOURCE = 'D:/path/to/already-built/deepseek-harness'
node scripts/build-release.mjs
node scripts/check-platform-tests.mjs
node scripts/check-platform-release.mjs
```

The test runner uses a scratch-only source bridge for genuine shared JSX integration tests and the runtime's existing public development tools. It never changes shared dependencies. The release runner packs all three plugins, installs exact archives through the official CLI into a new synthetic offline profile, compares every installed file with the packed candidate, checks root/Client consumer contracts and official compatibility without exemptions, and checks authenticated draft/data/lifecycle recovery after a cold restart. Public dependencies use existing built package links; this proves exact product installation and runtime compatibility, not fresh registry resolution. Test fixtures and archive verdicts remain under ignored `.scratch` and contain no production profile or credentials. The release runner makes zero model calls.

This scoped platform acceptance does not replace ticket11's documented broader partial acceptance, including live BetterSidebar visuals, same-session concurrent native turns and full sensitive parsing.
