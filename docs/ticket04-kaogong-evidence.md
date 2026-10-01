# Ticket 04 Kaogong Integration Evidence

Implementation scope: `plugins/kaogong` and this evidence. Worktree: `kaogong-integration`, branch `codex/kaogong-workbench`, based on merged ticket 03. Target: actualDSH `D:/programming/workspace/deepseek-harness`, DSH `0.2.0-rc.2`; public workbench `/client` types consumed from the built ticket 03 package. No core, daily profile, canonical Kaogong, workbench runtime, secrets or private PDFs were edited; no push.

Kaogong registers installed metadata, the five real business pages and default layout through the optional Cordis child. Its app ID is `kaogong`, keyed official slot is `personal-workbench.app`, and existing Host data belongs to instance `default` without migration. The sidebar action delegates to the common workbench owner or uses the standalone panel. The state map has fixed key types and namespaced reader keys; optional registration disposal does not own that map. Pending submission results survive transfer, submission remains guarded, and newer reads reject stale dashboard/practice responses. Reader fetches check abort status before writing shared state.

Automated verification against the actualDSH built runtime:

- 28 existing TypeScript business tests: core, schemas, knowledge import, material repair and mocked MinerU regressions.
- Built browser entry tests cover real Cordis optional-service lifecycle and official SlotRegistry, unique keyed registration, removal/reappearance, consumer hot reload, all five pages, inactive/close restoration, draft/reader/search/results/reflection preservation, submission transfer without double submission, seen-ID cycling, stale dashboard/practice/reader responses, answer withholding, image routes, table rendering, and existing clipboard failure behavior.
- 11 built-client/package tests pass, including 10 browser/lifecycle regressions and 1 packaging check. Structured lesson/review handoff is verified; a supplied role handler bypasses main-session creation and automatic closing.
- Host and client tsdown builds; strict client declaration emit; public `/client` consumer compilation including rejected invalid cell keys/value types.
- Package dry-run checks include client/Host bundles and emitted client declarations; no required workbench dependency, client injection or browser `require()` import.

The tests use synthetic materials and controlled Host API responses. They do not establish live learner-page image acceptance, native chat/streaming/tool/approval/question ownership, desktop/mobile layout acceptance, installed-plugin workflow acceptance, or with/without Better Sidebar acceptance. Those remain final runtime gates. Tickets 06/07 own persistent role associations and embedded classroom conversations; the clipboard handoff is not evidence of those capabilities. The plugin-lifetime map preserves drafts during optional integration changes but does not persist drafts across browser refresh or Kaogong plugin reload. Existing submitted records stay in their unchanged Host domains.

## Ticket 06 Consumption

The public Kaogong `/client` entry exports `KaogongView`, `KaogongViewProps`, `KaogongWorkbenchContent`, `KaogongTeachingRequest`, `PracticeContext`, `PracticeResult`, `KaogongStateContext`, `KaogongViewState` and `useBusinessState`. The workbench adapter receives the unchanged official `WorkbenchAppProps`: `appId`, `instanceId`, `pageId`, `active`, `selectPage(pageId)` and `close()`, plus Kaogong's `ctx` and optional `onOpenTeacher`. Place it under the existing plugin-owned `KaogongStateContext.Provider`; reuse the state created by `apply`, rather than creating another practice owner. Page IDs are `classroom`, `practice`, `errors`, `materials`, `plan`. Omitting `pageId` on `KaogongView` retains the standalone combined dashboard.

`onOpenTeacher(prompt, request)` runs only after a user teaching/review action. `request.kind === 'lesson'` carries `{ context }`; `request.kind === 'review'` carries `{ context, result }` from the scored practice. Context fields are `subject`, `title`, optional `knowledgePoint`, optional `planIndex`, and `limit`. The legacy prompt remains available for backward compatibility; consumers resolve bindings from structured fields rather than parsing it. A custom adapter callback owns role acquisition and navigation; it bypasses the main-chat/clipboard fallback and does not automatically close the window. No Session/preset identity is fabricated by ticket 04.

The shared map exposes typed cells including `practiceItem`, `practice`, `answers`, `result`, `seenQuestionIds`, `errorReasons`, `moduleSummary`, and `reader.query`, `reader.selected`, `reader.entry`. A selected reader entry includes its stable `id`, `title`, `subject`, `kind`, `source`, and full sanitized-renderer input `content`. Treat material/result values as user evidence, not teacher rules. Host binding persistence and exact native Session draft ownership remain ticket 06 responsibilities, following external `notes/role-association-review.md`; the application map is not a role-binding store.

Verification commands (PowerShell, from `plugins/kaogong`):

```powershell
$env:KAOGONG_TEST_RUNTIME='D:/programming/workspace/deepseek-harness'
$env:KAOGONG_WORKBENCH_TYPES='C:/Users/pc-zzy/Documents/ChatGPT/deepseek-harness/.scratch/personal-workbench/worktrees/workbench-window/plugins/personal-workbench'
& D:/programming/workspace/deepseek-harness/node_modules/.bin/tsdown.cmd -c tsdown.host.config.ts
& D:/programming/workspace/deepseek-harness/node_modules/.bin/tsdown.cmd -c tsdown.config.ts
node scripts/check-client-types.mjs
node --test tests/views.test.mjs tests/package.test.mjs
node --import file:///D:/programming/workspace/deepseek-harness/node_modules/tsx/dist/esm/index.mjs --test tests/core.test.ts tests/schemas.test.ts tests/knowledge-import.test.ts tests/material-repair.test.ts tests/mineru.test.ts
```
