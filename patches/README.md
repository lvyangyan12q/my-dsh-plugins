# Native sidebar retirement upgrade

The upstream DSH `0.2.0-rc.2` package does **not** promise durable retirement of dormant saved layouts. The Workbench main entry works on that version, but full optional-sidebar unload acceptance requires this additional native capability. Package semver alone does not establish support: the adapter checks `retirementVersion === 1` and callable `retireTabsByKind`.

[Review the source patch](dsh-sidebar-retirement-v1.patch). It is a native-core fork change, not a plugin workaround or an upstream release claim. The patch contains only the generic sidebar package and its design note; it carries no user profile, private material, absolute workspace dependency, generated bundle, or session content.

## Source and safe build

The patch base is native DSH commit `639ed015397290b3745d163aafe02ffee4aa3f84`; reviewed implementation tip is `30799d0749958df8b52ad5d8dec0fe26d54e43da`. It introduces no dependency, Host API, Session format or native-menu change. The native commit's automatic third-party notice URL refresh is intentionally outside this source patch; the target repository's existing generator owns notices.

Use a separate clean DSH checkout or archive and isolated dependency/artifact directories. Never apply or build in a user's dirty checkout or on the formal running profile. Before applying, run `git apply --check /path/to/dsh-sidebar-retirement-v1.patch` from that clean checkout; then apply the same patch and review the diff. Later native baselines require normal conflict review rather than forced application.

The target repository declares Node `^22.19.0 || >=24.0.0` and pnpm `11.7.0`. Prepare dependencies according to its lockfile in the isolated checkout; do not install through node_modules junctions into another checkout. Build serially using its `pnpm run build:official` entry: native-system, Host/Client libraries, then web assets and the client build record. Boot only the isolated output and isolated profile. Copying source files alone, or resolving old workspace packages through shared node_modules, does not prove the new capability was loaded. Verify `ctx.sidebarRight.retirementVersion === 1` in the actual Client runtime before acceptance.

## Public contract and ownership

A provider requests only its exact owned kind. The native operation enumerates saved and live scopes without adopting dormant Sessions or starting Agents. Each record reports verified removal or blocked/storage/unsupported failure; overall complete or not-found is the only successful completion boundary. Service-unavailable and in-progress remain pending. Native validation, persistence, close handlers, Guide protection, identity allocation and settling remain core-owned. Undo cannot resurrect the retired occurrence; the same kind may be registered again to create new occurrences.

Workbench stores bounded versioned cleanup intent under its own browser key, reads legacy identity-only markers, and keeps partial failures even when the native inventory is empty. Its old-face fallback closes known retired IDs only and retains the unverified whole-kind request. Re-enabled providers pause prior kind-wide retries to protect fresh occurrences; their next explicit unload requests cleanup again. No provider writes native layout storage, adopts sessions for cleanup, registers a root effect to escape disposal, or cancels Agents through this API.

## Verification boundary

Native sidebar package: 263 tests passed, including real native apply disposal, dormant/live/released/floating layouts, persistence rejection, close refusal, undo/redo, and same-kind re-registration. Plugin adapter: source seam and built factory with real Cordis owner/provider lifecycle tested against the declared additive public service; the old built native runtime remains the compatibility fixture. These checks do not replace the actual new-core installed browser acceptance or full repository build/type/GUI gates. Validate both plugin disable orders, dormant records, refresh/restart, unrelated File/Guide tabs, retained conversation state, and re-enable on the isolated runtime before completing ticket 01.
