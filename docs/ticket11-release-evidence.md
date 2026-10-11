# Ticket11 Release Evidence

2026-10-02. Candidate based on combined tickets01-10 and metadata fix at `16a914887c9cbe9b444502373db313c67ae7d659`. Status: **partial draft; interactive acceptance pending**. The user chose local ticket11; [tracking](agents/issue-tracker.md) and [spec](personal-workbench-spec.md) are the review sources.

## Passed Checks

Actual built DSH `0.2.0-rc.2`, checkout `639ed015397290b3745d163aafe02ffee4aa3f84`; Node `25.2.0`, pnpm `11.7.0`. Node22 portability uses declared tsx/dev tools; execution on Node22 itself was not performed.

- Clean combined build: Workbench09 Host/Client plus real declarations and source consumers first; Kaogong10 Host/Client and newly emitted root Host declarations against those new workbench types second.
- Kaogong: **66/66**; Workbench: **73/73**; root release fixtures: **3/3**. Root timeout-tree test passes with Windows process-control permission; its first sandbox run refused taskkill. All owned fixture children were checked stopped.
- Archive dry-run listing equals actual tar listing. Synthetic private-file markers, unreviewed images, maps, check/scratch outputs and legacy role wiring are excluded. An unreferenced old runtime chunk is rejected. Two verified PNGs, three application personas, the actual teaching Skill, known public samples and notices remain.
- Official normal hoisted installation with `autoInstallPeers:false`, offline and scripts disabled, of the exact archive pair into a fresh owned home. No workbench runtime peer, compatibility exemption or automatic Core peer installation.
- Installed bytes for every packed member match the candidate. Both root and Client package-name consumers pass strict NodeNext compilation with `skipLibCheck:false`; no product source paths or tsconfig mappings satisfy this gate.
- Synthetic old notebook v1, progress v1 (including a completed day item), bank v2 and knowledge v1 survive upgrade. Original answers, IDs, notes, images and result bytes remain intact. Baseline08/09 creates an actual issued round, native teacher/counselor IDs and assignment before upgrading to the final pair.
- Installed practice: concealed pre-submit answers, Host score, idempotent exact submit, explicit conflicting retry, durable reflection, single history entry and eleven notebook records (one legacy plus ten issued IDs). Uncertain review remains `sending` and cannot silently resend after restart/reinstall.
- Installed lesson/task flow rejects fabricated completion fields, rejects confirmation without score, keeps prose nonauthoritative, links submitted facts, requires explicit confirmation and preserves completed plus selected unfinished lessons. Exact subject teacher preparation is read-only.
- Native ordinary-user pre-step uses the existing public Session controller/Agent events/tool-skill loader and packaged current teaching Skill; exact Session ID is preserved and durable sequence does not change. This is a proposal, not committed Skill history or a completed turn.
- Actual cookie-authenticated image GET and HEAD with loopback Host and **no Origin** pass. Missing cookie401; foreign/null Origin and cross-site403. Bundled, historical and document images match known PNG bytes.
- Actual native settings.update changes authenticated historical-image/document readers to explicitly configured second roots and back, without replacing business-domain ownership. Secret descriptor is redacted; an update omitting the synthetic token preserves it. Profile-owned config is used: command-line overlays correctly refuse native edits.
- Installed omitted/relative optional-root configurations start successfully and retain scores/lessons. Historical/document reads report local503 while the bundled image remains available. Parser validation rejects unconfirmed root usage before source access, conversion/upload or job writes.
- Official workbench uninstall leaves business/role/management storage hashes unchanged; standalone Kaogong keeps learning data and returns503 for absent role preparation. Workbench reinstall restores exact teacher/counselor IDs and assignment. Official Kaogong uninstall preserves storage hashes and external results/assets; reinstall restores full round/reflections/review, lessons and unfinished tasks.

Final retained proof: owned `.scratch/release-1790873634543/`, with `verdict.json` and structured `archives/manifest.json`. No fixture home, cookie, token, private PDF or result directory is committed.

| Archive | SHA-256 |
| --- | --- |
| deepseek-ai-dsh-personal-workbench-0.1.0.tgz | `116a2864a1395a4bf7e097e8ee43f46b0a3e24667143b4e1f2911b3186175653` |
| deepseek-ai-dsh-tool-kaogong-0.1.0.tgz | `45637d167fa62d187aeb79400a90f634f8220379835cc21b05b3d002114508de` |

## Type And Ownership Boundaries

Kaogong root DTS is emitted from actual Host source and all transitive modules, not a stub. Portable public DomainGlobalSpec annotations avoid leaking local zod package-manager paths. Source checks deliberately use explicit built declaration mappings; installed checks are distinct.

rc.2 profiles use the CLI's first-party install anchor rather than installing Core copies beside products. The installed consumer fixture copies only the actual installed product package bytes into its disposable consumer and exposes real public built first-party package exports from that same explicit rc.2 anchor. Schemastery/zod come from the installed profile. React/type tools are explicit dev anchors. This is not a claim that the profile alone supplies every Core TypeScript package or that development junctions establish installation.

Public Config now truthfully describes native resolved references: `mineru` and `questionImageRoot` are `Volatile`, read via `.get()`; raw profile fields remain plain YAML. The native configure API owns page policy, not an invented installSection compatibility layer. Generic workbench role implementation, Session ownership, full keys and assignment revisions are unchanged.

Domain names/versions, issued-round scoring, lesson ownership and application routes remain stable. Existing actual-domain tests cover partial projection recovery, reflection preservation, queued command failures and awaited lesson-before-practice-before-domain drain. There is no new cross-domain transaction API or parser/network work.

## Reproduce Offline

From the release worktree, use explicit existing built/tool/cache inputs; never a user profile. Provision declared dev tools using an already available offline cache, or supply the explicit existing anchors. No script downloads fixtures.

```powershell
$env:DSH_SOURCE = '<absolute-built-official-rc2-checkout>'
$env:KAOGONG_TEST_RUNTIME = $env:DSH_SOURCE
$env:KAOGONG_TEST_TOOLS = '<absolute-compatible-dev-tools-root>'
$env:RELEASE_TSDOWN_CLI = '<absolute-existing-tsdown-cli-script>'
$env:RELEASE_NPM_CLI = '<absolute-existing-npm-cli-script>'
node scripts/build-release.mjs
node --test tests/release-package.test.mjs

$env:RELEASE_CACHE_ROOT = '<existing-public-offline-cache-fixture-root>'
$env:RELEASE_BASE_WORKBENCH_ARCHIVE = '<absolute-reviewed-09-tarball>'
$env:RELEASE_BASE_KAOGONG_ARCHIVE = '<absolute-reviewed-08-tarball>'
node scripts/check-release.mjs
```

`RELEASE_CACHE_ROOT` supplies `store/` and `cache/v11/metadata/`; copied store projects are excluded. Optional `RELEASE_ROOT` must be a new strict child of this worktree's `.scratch`, with real parent containment. Existing roots are never silently reused/purged. Full suites use the declared tsx CLI with `--test tests/*.test.ts tests/*.test.mjs` in each plugin directory; Workbench also needs `DSH_SOURCE`. Run the role-package inspection separately; its local resolution output is not installed runtime evidence.

The checker replaces home/profile/AppData/XDG/npm settings, disables telemetry/automatic Agents, denies outbound HTTP/socket attempts, keeps bootstrap credentials in memory and awaits owned children. pnpm remove accepts `--config.offline=true --config.ignore-scripts=true`, not add's `--offline --ignore-scripts` switches. An earlier probe blocked outbound attempts but retried before this correction; it did not complete preservation and is not passing evidence.

Keep verdicts/manifests before optional cleanup. Stop all owned processes, resolve the exact target/realpath, require a strict descendant of this worktree scratch and inspect reparse points. Use same-shell literal-path removal only for that enumerated owned fixture root. Preserve parent cache/evidence, borrowed tool junction targets, user profiles, canonical source, external asset/result directories and backups. This implementation does not purge retained fixture roots.

## Remaining Acceptance

- Chrome transport remains blocked. Actual installed no-Better-Sidebar and Better Sidebar0.24.1 modes have not passed the same interactive workflow.
- Desktop/narrow screenshots, actual image pixels/material framing, keyboard/focus/overlap and answer-concealment browser checks remain pending. PNG bytes and synthetic DOM checks do not satisfy these gates.
- Native completed/continued turns, streaming/tool rendering, approvals, questions, Stop and close-without-cancel remain pending. No external model call, keyless completed provider turn, private parsing or fake chat engine was exercised.
- Parent's read-only native-view audit found no confirmed wrong-role routing defect, but did not mount the complete native conversation factory. Its per-ID service probe is not native composer acceptance. The full native Client dependency roster is preserved.
- Native completionUnread is a completion reminder acknowledged through mainView retention, not pane-read acknowledgement or an unread-message count. Check its native semantics without acquiring mainView just to clear it.
- Test the same Session concurrently displayed in main chat and a retained role/proof pane, including hide/show and both unmount orders. Native InputHub shares a single editor per binding; competing editable roots are a concrete composition concern, not a reproduced published failure. Require correct draft, focus and send ownership before claiming support; different Session IDs do not establish this same-ID gate.
- Parent review/fix phase remains outstanding. Keep the PR draft and task11 partial until those gates are independently completed.

### Current exact remote-source upgrade (2026-10-10)

Implementation b42d3f7 was independently exported from the verified remote commit, built and installed. The full old-pair -> current-pair upgrade, lessons/tasks/score/role association recovery, cold restart, omitted/relative root behavior and official Workbench/Kaogong uninstall/reinstall passed in a new isolated synthetic profile. No model calls occurred. Receipt with exact old/current archive hashes and actual verdict: [current remote-source proof](evidence/2026-10-10/remote-committed-source-b42d3f7.json). Historical Chrome-blocked statements above do not describe the later browser capability: bounded actual browser evidence is in worktable-canvas-evidence.md. Full live teaching/sidebar/model/physical-IME gates remain incomplete.
