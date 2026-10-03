# Application platform acceptance evidence

Date: 2026-10-03. Execution environment: Node 25.2.0, pnpm 11.7.0; Node 22 execution was not tested. Scope: application-platform tickets 01–07, independent Reading application and existing Kaogong integration. This evidence does not mark the older ticket11 acceptance complete.

## Reproducible package and runtime checks

With `DSH_SOURCE` pointing to an already-built official DSH `0.2.0-rc.2` checkout:

```powershell
node scripts/build-release.mjs
node scripts/check-platform-tests.mjs
node scripts/check-platform-release.mjs
```

The build passes for Workbench, Kaogong and Reading: clean Host/Client artifacts, Workbench/Kaogong declarations, source checks and public consumer contracts. The full runner passes **211 tests, 0 failures, 0 skipped**. It uses actual shared source implementation for JSX integration; its scratch-only bridge is separate from installed-consumer proof. Native Session Controller/Agent Loop/Skill/preset integration uses the official MockAdapter and synthetic domains. These tests do not contact DeepSeek.

The release runner passes through the **official CLI installing all three exact archives** in an owned synthetic offline profile. Every installed archive file matches the built candidate. All three manifests pass official runtime compatibility with **zero exemptions** and ordinary peer policy. Root and Client declarations compile from installed product packages with no source/path remapping; Reading's installed JS Host and Client exports are consumed separately. Runtime dependency links use existing public built packages, so this is exact product installation proof rather than a fresh registry dependency-resolution test.

Authenticated HTTP checks reject missing credentials and foreign origins. Reading starts without implicitly seeded records, explicitly initializes three public synthetic records (210 minutes), and isolates an empty second instance. Preview cannot initialize data. Saving/previewing a draft leaves it inactive; explicit activation publishes version 1. Unknown-module version 2 fails preview and activation while retaining running version 1. Cold restart retains the invalid draft, prior running version, exact own data and disabled flag. Re-enabling retains data; official Reading removal/reinstallation and another Host startup retain the running version and re-enabled state. Release checks make **zero model calls**. Only temporary owned Hosts are started.

Actual archive checks exclude private material, environment files, caches, source/tests and maps. Public examples and teaching assets remain distributable. Each run leaves an ignored `.scratch/platform-release-*/verdict.json` with archive hashes and an ignored `.scratch/platform-tests-*/tests.log`; synthetic profiles never copy the user's real profile.

## Formal Browser observations

The formal configured instance retains native workspace/conversation navigation, Skill center, plugin management and automation navigation. Existing Kaogong still reports 3,994 bank questions, 72 material entries and 8 historical learning entries. App-center disable/re-enable persists and restores its launcher. User material content and local paths are excluded from this repository evidence.

Ordinary recipe form: save → preview → explicit activate → open → process restart recovers the running version. A later invalid unregistered-module draft refuses preview and leaves the old running version. Reading template: preview shows 3/210/70 count/total/average; Science filter shows 1/60/60; selecting Origin of Species shows matching detail. Explicit activation creates an independently usable running application; disable/re-enable retains selection and data. Independent instance separation is covered by the installed synthetic profile and Client/native tests. Preview and display produce no role/model request.

Reading role handoff: an installed reusable Agent appears by name while the recipe stores its exact native preset ID. Two pages share a stable role. Preparing selected Origin of Species captures actual selected record and scope; editing the public synthetic record chunk and removing scope stays visible across both pages. **One explicit send completed through configured DeepSeek V4.1 Flash**, showing one native user prompt and response (one round/one step, approximately four seconds). Returning to the other page shows the same history and no restored removed scope. A fresh final-process restart restores that same reading prompt, answer and composer on the first open without retry or a substitute Session. This is real provider evidence, separate from MockAdapter tests.

Kaogong shared modules retain subject filtering, search, list/statistics, full selected-document markdown and historical image associations. Teaching preparation captures visible material and goal chunks without creating a teacher Session; editable/removable context remains explicit. Formal Kaogong teaching also completed through DeepSeek V4.1 Flash: the user explicitly removed every learning-material/goal context chunk, entered a synthetic acknowledgment task, and sent to the subject teacher. The native prompt contained its controlled teaching Skill, the synthetic task and an empty context array; its approximately two-second, one-round/one-step response acknowledged the handoff. HMR/reopening retained the same history. Deterministic tests separately cover exact subject-teacher sending, once-only review admission and native failure recovery. The latest formal preservation check passed all five authenticated HTTP routes, retained the 3,994/72/8 counts and old IDs, matched the historical 78,651-byte PNG, and found all four original learning-domain SHA-256 hashes unchanged. Its private local storage paths and backup records are kept outside Git.

## Configured-provider recipe generation

The final formal Browser gate passes on the integrated native parser/hydration fixes. An actual DeepSeek turn generated a validated **version 3 draft at revision 6**, while running version 2 stayed intact. The ordinary description form remained editable; saving it produced revision 7. Preview rendered the generated split layout and four display modules with 3/210/70 count/total/average, Science filtering to 1/60/60 and selected Origin of Species detail. Role-chat preview explicitly created no Session. Explicit activation produced revision 8/running version 3. The live application retained all three owned records and the prior native role history; its unfiltered 3/210/70 state remained independent of preview. Refresh recovered version 3, enabled Kaogong and the disabled test application.

Earlier tool-inventory and native reasoning-block parser failures left draft revision and running version unchanged. The final parser accepts native thinking/reasoning plus completed recipe text while still rejecting executable/tool output and incomplete/invalid JSON. Native MockAdapter tests separately cover failure, cancellation and CAS boundaries. All formal model inputs used public synthetic structures, example reading titles or acknowledgment tasks; no private learning material was sent. Browser screenshots and private storage-verification records stay outside Git.

Implementation acceptance is complete. The parent branch's final code review and PR disposition are handled separately; the parent specification stays open until the PR actually merges.

## Visual scope

The previously listed functional interactions are verified. Creation now has four navigable stages (name/pages, connections, roles/tasks, preview/activation), sharing one editable draft. The current Reading controls and list still use basic browser styling; grid spacing is not fully polished. The final review identified an unbounded role page that clipped the lower native conversation. The follow-up fixes give single-role pages the available width and height, bound the task editor and native chat, and retain scrolling on mixed and narrow pages. Formal Browser verification of this fix is pending; earlier screenshots do not establish the corrected layout. No claim is made that the implementation matches prototype pixels or that all screen sizes are visually accepted.

## Limits

This release delivers installed registered modules and scalar recipes; it does not generate arbitrary plugin code, grant arbitrary cross-app data access, or provide maps/credential management. Preview is read-only for application data. Model generation creates editable drafts and never automatically activates them. Existing native history is preserved when a role's Agent changes. Broader historical ticket11 gates for live BetterSidebar visuals, same-session concurrent native turns and full sensitive parser acceptance remain documented partial in `ticket11-release-evidence.md`.
