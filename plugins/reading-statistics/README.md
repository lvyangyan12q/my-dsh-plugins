# Reading statistics

Reading owns its `reading_statistics` version 1 Host storage domain and all records.
The data owner requires native `storageDomain` and authenticated `connection` services;
the official web/base runtime provides both. Native runtime compatibility is pinned
to the tested `0.2.0-rc.2` release, including the storage-domain dependency and
host-webserver peer, so installation cannot select a newer alpha storage provider. No Session or model request is created.

## Worktable deep application

Install this package alongside Worktable and apply its `cordis.patch.yml`. No legacy
personal-workbench installation or client injection is required. Host contributes
`reading-statistics` through `worktableApplications`; the client contributes `page`,
`stats` and `list` through `worktableApplicationViews`. Each adapter unregisters
independently when its platform service disappears and restores when it returns.
The business data owner remains available independently of either adapter.

Choose Reading statistics in the Worktable application entry and explicitly create
an instance. Open its full page, statistics or list views. The full page owns search,
category/status filters, selection and record management. All views of the same
instance share filters and selection. Other instances start empty. Use **新增阅读记录**
to add your own record, or **初始化示例记录** to explicitly initialize three public-domain
examples in this instance. Initialization is idempotent and never copies `default`.
The full page does not provide a second instance switcher or native session layout.

Closing every view aborts reads, releases all reading subscriptions, removes the
inactive state owner and releases its record snapshots. Remounting reads current
Host records. Presentation preferences use a versioned browser-local key per instance,
with a bounded 64-instance in-memory fallback. They survive view closure and adapter
re-registration. A browser storage write failure is visible in the UI; fallback
preferences may be lost on refresh or eviction. Separate windows have independent
live preferences and notifications; this is not a cross-window synchronization or
full durable-recovery protocol. Host records remain durable across restarts.
Late reads and mutations are fenced by instance identity and request generation.

## Instance sharing (05)

Use the full page's **资料共享** disclosure. Select a target reading instance and
confirm read-only sharing. The owner can separately allow create/update/delete or
revoke the reference. Business records remain only in the owner instance. Other
instances do not inherit the reference, filters, selection or sessions. Use
**刷新资料与权限** / **刷新共享状态** after changes in another browser window.
Revocation blocks future access and late reads; it does not erase native AI history.
An already-started write can commit before revocation takes effect; its response
explicitly reports committed status and withholds data if access changed meanwhile.

Writes require the editor's captured business revision and current connection
revision. Stale edits fail visibly without retrying over newer records. Original
reading_statistics v1 business rows are unchanged; conflict counters live in a
separate reading_statistics_revisions domain, paired with a content digest.

## Legacy pairing and validation

The arbitrary-instance-ID `/api/reading-statistics/data` route now returns 403.
Existing default/other records remain in their original domain. Optional old recipe
registration is retained, but its old arbitrary-ID data adapter cannot read/write
through this version. Pair this reading package with the 05 Worktable resource
service; no legacy personal-workbench frontend is loaded by the deep path.

Build with `tsdown -c tsdown.config.ts`; typecheck uses the existing optional legacy
type declarations only. Set DSH_SOURCE to the built official runtime and run
`tsx --test tests/data-grants.test.mjs tests/data-grants-ui.test.mjs` for current
resource-owner and React auxiliary tests. Historical reading-platform/deep-views
fixtures are retained with their original pre-05 API assumptions; their arbitrary-ID
success expectations are incompatible with the deliberate 403 change and are not
reported as passing 05 tests. Final installed UI verification is a separate root
acceptance step, including refresh/restart and version-pairing checks for ticket09.
