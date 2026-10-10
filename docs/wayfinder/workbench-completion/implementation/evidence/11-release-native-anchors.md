# Release native anchors follow DSH_SOURCE (ticket 11)

The official release runner previously resolved product native dependencies from the plugin worktree. Switching DSH_SOURCE changed the CLI but could still install old native dependency links, so that result was insufficient evidence of the selected runtime's actual installation.

The public release dependency resolver now locates native @deepseek-ai package entries from the selected built workspace (its Node resolution, pnpm exposure, or exact package manifest name). Canonical package root and actual entry must remain strict children of canonical DSH_SOURCE. Missing builds or foreign native links fail explicitly with no old-core fallback. Ordinary third-party dependencies retain the worktree anchor, and product packages still come from exact archives. No compatibility policy or exemption was changed.

RED: a public isolated old/new package fixture linked the old worktree domain rather than the selected source domain. GREEN: four public tests cover the matching source manifest/built entry, foreign native junction rejection, unchanged third-party anchoring, and absent native build rejection. The release runner includes these tests in the existing gate and emits native-anchors.json plus nativeSource/nativeAnchors in its verdict for independent inspection.

Read-only dry-run of the physically isolated eba13b runtime found @deepseek-ai/schemastery resolving outside DSH_SOURCE; the new guard rejected it. That runtime dependency exposure must be corrected by its owner before claiming the new runtime installation gate. This slice did not build, install, start a Host, alter formal profiles, run the full release gate or close ticket 11. Native Win32 declared skips remain native limitations, not plugin exemptions.
