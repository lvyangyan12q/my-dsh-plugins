# 01 — Additive durable sidebar retirement adapter

This is a source and public lifecycle checkpoint, not installed browser acceptance. Ticket 01 remains open.

The adapter checks the explicit native `retirementVersion: 1` and callable `retireTabsByKind`, then requests only `personal-workbench.catalog`. Partial, unavailable, interrupted-service and in-progress results retain bounded versioned own-key intent even when inventory has no identified tabs. Complete/not-found is the only full-kind completion result. Native private persistence, forced Session adoption, root effects and Agent cancellation are not used.

A re-enabled provider pauses a prior kind-wide retry until its next explicit retirement, protecting fresh occurrences. The old face keeps the known-ID adopted cleanup path but cannot clear a whole-kind request merely because inventory is empty. Old marker records are still read. Own marker writes are read back, and recovered storage can clear uncertainty after a verified write.

RED/GREEN checks observed missing public delegation (expected exact kind but no call), missing provider-resume protection, legacy capability erasing empty-ID failure intent, and permanently latched own-storage uncertainty. Targeted source tests and the built Client factory with real Cordis owner/provider lifecycle now pass 9 tests; Workbench source/type checks pass against the already-built legacy official runtime. A new native public service fixture exercises the additive face; it does not substitute for installed new-core verification.

The generic native change is delivered separately as a [reviewable patch and upgrade procedure](../../../../../patches/README.md). No source build, patch application, install, profile modification, model invocation, or formal-instance restart was performed by this adapter task. Native package regression passed 263 tests in the separate native branch. The complete formal new-core build, actual plugin disable orders, dormant refresh/restart, File/Guide preservation and re-enable behavior remain integration acceptance.
