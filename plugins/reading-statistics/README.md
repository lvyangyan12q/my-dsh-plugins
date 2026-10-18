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

## Optional legacy recipe entry

An explicitly installed personal-workbench can still register the original reading
recipe/data-source/editor adapter. That optional service lifecycle is separate from
Worktable and is never loaded by the new deep path. Selecting its legacy template
explicitly initializes examples in `default`; existing IDs and records are retained.
Legacy preview remains read-only and reads the legacy default snapshot.

## Build and tests

Build with `tsdown -c tsdown.config.ts`. The package includes only `lib`, this README,
`cordis.patch.yml` and package metadata. Set `DSH_SOURCE` to the built official runtime
for `tsx --test tests/*.test.mjs`. On a fresh worktree, `READING_LEGACY_ROOT` can point
to a checkout with built personal-workbench/kaogong clients for compatibility tests;
those artifact bytes are read without modifying their source or loading the old UI
in the new application. `KAOGONG_TEST_TOOLS` can identify the existing test tool root.

The route retains same-origin authentication, strict bounded JSON, read-only preview
and explicit deletion confirmation. Per-instance resource authorization, concurrent
revision conflict handling and cross-window synchronization belong to later work.
