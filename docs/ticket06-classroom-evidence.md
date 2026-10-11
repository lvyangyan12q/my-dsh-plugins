# Ticket 06: Fixed Teacher Classroom

Status: code-first implementation candidate. **Not runtime accepted.** Base: `cf4ba09`; official public API target: built DSH `0.2.0-rc.2`, evidence revision `639ed015397290b3745d163aafe02ffee4aa3f84`.

## Stable Public Contract

Source: `plugins/personal-workbench/src/role-binding-api.ts`. Package root exports Host types; `/client` exports Client types. No consumer imports internal implementation files.

- `RoleBindingKey { appId, instanceId, roleId, subject? }` uses a complete structural tuple. Ticket 06 supports only `kaogong/default/teacher` with no subject. Other keys explicitly fail; this is not a general role engine.
- `RoleBinding { version: 1, key, sessionId, presetId, phase: 'intent' | 'ready', previousSessionIds }` is Host-owned, not a browser preference or copied transcript.
- `ctx.personalWorkbenchBindings.read(key)` reads only. `ensure(key)` is an explicit create/resume operation. `retry(key, expectedSessionId)` and `replace(key, expectedSessionId)` reject stale IDs; only replacement allocates another ID and preserves prior IDs.
- Optional `ctx.personalWorkbenchRoles.open(key)` reacquires only. `teach(key, TeachingEvidence)` prepares and submits one explicit user teaching gesture. `retry` and `replace` retain the same expected-ID guard.
- `renderFactorySlot('personal-workbench.role-conversation', { bindingKey, active }, { fallback })` renders the root-scoped fixed-teacher surface. Its session-scoped child delegates the whole native `conversation.content` with `variant: 'embedded'`, `hero: false`, beneath the exact `SessionProvider`. The component owns neither synthetic messages nor a fake composer.

## Ownership And Failure

One new domain, `personal_workbench_role_bindings`, version 1, table `bindings`. No existing Kaogong domain is opened or changed. Per-key commands serialize. A preallocated intent is durable before `sessionController.create({ sessionId, agentPreset })`; finalization failures retry the same ID after restart. Domain shutdown drains admitted commands and in-flight HTTP requests before closing its own handle.

Ready bindings validate the declared preset and the native `agentPreset` projection, not the immutable creation header. Missing, changed or inaccessible Sessions never silently use a default or recreate a ready ID. Existing IDs remain available in errors for explicit retry/replacement. Archived/inaccessible history is also excluded by the reused ticket 02 `TeacherWindow` authority checks.

UI references and command references are independent. Native teaching uses `sessions.using` with the exact bound ID, rechecks archive/history/stale identity, and holds the command scope through `conversation.send` settlement. Closing/hiding a view releases only local UI ownership; no cancel/archive/delete command is called. The existing workbench keeps hidden application views mounted. Kaogong also shares its original state owner across standalone/workbench, pages and optional-service replacement; draft answers never enter lesson evidence.

The left pane is the existing safe material reader, including image references, tables and sources. Evidence contains current target and selected full material, plus submitted results only for review. It is marked untrusted JSON data, never a system prompt. Slashes inside serialized data use literal JSON `\u002f` escapes: JSON decoding preserves URLs and original content, while the native scanner cannot interpret embedded `/other-skill` as another user invocation. The real pre-step negative test includes an unescaped vulnerable control. No PDF upload was added. Missing optional role services leave base workbench/Kaogong registered and show local unavailability. Missing routes, non-JSON replies, authentication failures and 503 responses do not expose parser errors or raw bodies.

## Skill And Preset Boundary

Fixed preset `personal-workbench.kaogong-teacher.v1` declares official scope-only persona (`complete: false`), filesystem Skill provider and `dsh-tool-skill`. It does not replace native guards, models, tokens or tool permissions. The packaged `skills/kaogong-teach/SKILL.md` is the existing Kaogong teaching rule body, not the obsolete executable `roles/cordis.yml` composition.

`bundledSkillDir` resolves relative to the installed module/package. `includeDefaultRoots: false`, empty `customSkillDirs`, `watch: false`. Only installed teaching rules are trusted bundled content; material/user paths are not granted this capability.

Preflight checks actual catalog/provider, user invocation policy and `skills.get` body readability in the preset lease. This is **not native turn injection acceptance**. The exact scoped command sends literal `/kaogong-teach ...`; the official tool-skill pre-step loads and injects the body. Tests exercise the real SkillRegistry/filesystem and real native pre-step with an in-memory native Session and no LLM call, including external forged/unknown slash negatives and cleanup. They do not prove this installed teacher preset or a real learner turn.

Ticket 07 ownership follow-up: move the fixed Kaogong preset/Skill declaration back to the application boundary. Ticket 06 temporarily packages and owns it in workbench only to verify the fixed teacher; do not extend this duplication into a generic workbench policy or promise multi-role/subject behavior.

## Dependency And Package Evidence

New runtime dependencies: `zod` (`^4.4.3`); optional pinned `@deepseek-ai/dsh-storage-domain`, `dsh-persona`, `dsh-skill-filesystem`, `dsh-tool-skill` (`0.2.0-rc.2`). Public Host service faces for presets, Skills, Connection and session controller are type-only. The base Host entry imports none of the new optional runtime helpers eagerly: its optional role module is a lazy archive chunk and failures remain local 503s. Actual services still come from the Host composition, not automatic package imports.

`check-role-package.mjs` checks declared versions, packaged Skill, declarations, lazy chunk and current runtime resolution anchors. Current new-package anchors resolve through owner-local junctions to the built official source packages. **This is source-boundary evidence, not actual tarball dependency installation.** Prior ticket 02 installed-archive results do not accept the new dependency graph. Ticket 11 must install the new candidate in a fresh actual home, resolve its new dependencies/peers and load/activate the installed preset and package-relative Skill. No daily profile or DSH core was changed.

## Reproduction And Remaining Gates

Final automated results: workbench 51 source/role/native-Skill/storage tests plus 8 artifact/UI/lifecycle/Host-import tests passed (59 total, including unchanged 19 ticket 02 ownership regressions). Kaogong 28 business tests plus 12 built view/package tests passed (40 total). Both bundles, emitted public declarations, source checks, public consumer compilation and archive dependency/chunk boundary checks passed. Local Host import is a candidate import with current local dependency anchors, not a new installed-tarball result.

Set `DSH_SOURCE` to the already-built official checkout. Workbench: `check-source.mjs`, `--emit-types`, `--check-consumer`; `test`, `test:artifact`, `test:lifecycle`, `test:host`, `test:roles`; `build`; `check:role-package`. Source/typed tests may use the checkout's `tsx` loader when local tooling is not installed. Kaogong: set `KAOGONG_TEST_RUNTIME` and `KAOGONG_WORKBENCH_TYPES`; run `scripts/check-client-types.mjs`, both tsdown configs, all business tests and built view/package tests. Checks use public API/ownership/HTTP fixtures, real Cordis/SlotRegistry, real storage domain/JSON medium, real Skill provider/native pre-step; none replace native chat with an internal fake conversation.

Outstanding: fresh new-tarball dependency/preset activation, actual restored teacher binding across Host restart, native streaming/tools/approval/Stop and close-during-run continuation, logged actual-turn Skill injection, authenticated Chrome, material image pixels, desktop/narrow layout and installed Better Sidebar/official sidebar visual comparison. Automated fixture/type/build/package-boundary passes cannot tick these gates. No browser runtime acceptance is claimed.
