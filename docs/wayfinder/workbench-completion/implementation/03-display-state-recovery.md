# Declared display connection recovery (ticket 03)

Observed installed failure: reading category Literature and selected Walden were reset by a browser reload even though the application window returned. DisplayStore owned only in-memory inputs.

The source fix stores only filter values, search text and selected record ID in a bounded version-1 browser cache. Identity includes application, instance, connection, source application/resource and preview mode. Records, material contents, statistics and executable role/session context are not persisted. Fresh source data remains authoritative: removed filter declarations/options and absent selected records are cleared after loading. Unsupported or unavailable storage is not rewritten and shows a memory-only notice while controls remain usable.

A declared source may subscribe to changes. One shared connection owner reloads on its source event, retaining valid UI inputs; owner disposal unsubscribes and ignores queued callbacks. This does not send model tasks or create Sessions.

TDD: initial public DisplayStore restoration failed with empty filters/search/selection; subsequent removed-filter and subscription slices failed before their fixes. Five store tests now cover recreation, pruning, subscription/disposal, owner identity isolation and blocked/future/oversized/silently ignored storage. Public RecipePage DOM test uses normal filter/search/list controls and verifies visible restored controls, count and detail after owner teardown/recreation, plus one source change reload. Existing chart/map, explicit/background refresh and statistics tests remain green. This component recreation test is not an installed browser reload or Host restart acceptance.

Remaining acceptance: install the merged source and repeat the real reading selection/browser reload and application record editing flow. Ticket 03 remains open; no checklist is closed by these source tests.
