# Ticket 02: Native Teacher Session Evidence

Status: implementation candidate; real-host acceptance pending. **Do not check ticket 02 as complete or unblock dependent tickets on this evidence alone.** No fundamental Web API blocker was found in the inspected official source. Desktop integration remains unsupported by this proof.

## Implementation

`plugins/personal-workbench` is an independent installable bundle. The Host registers one read-only association route. The association is the configured existing teacher Session ID, persisted in the official profile configuration. The client contributes one footer launcher, one additive overlay and a strict Session child slot. It acquires a `personalWorkbenchTeacher` reference, awaits real history opening, and supplies it explicitly to the renderer-provided `SessionProvider`. Beneath that Provider it renders the native `conversation.content` factory in embedded/active mode. There are no business runtime imports from other UI plugins, DOM transfers, copied histories, custom chat components or custom send/stop/approval implementations.

Closing withdraws the UI target before committed unmount releases its reference. Pending acquisitions release immediately on close. The generation guard prevents a late metadata/history response from reopening a closed or superseded window. Duplicate opens acquire once. Plugin disposal releases references idempotently. Unavailable associations/history stay explicit errors with Retry; no create/adopt/fork fallback exists. The fixed association is sufficient for this ticket's explicit-session proof, but is not the later general application/role storage model or teacher provisioning workflow.

Archive status is checked separately from existence/history access through the public `ctx.workspaces.list` source. Only `phase: ready` with `state: idle` authorizes acquisition; an initial empty pending set is not trusted. The archive check runs again after history opens. While visible, archive/feed and Session lifecycle subscriptions withdraw the native controls on archive, stale ready/loading, terminal error, removal or history failure. All subscriptions are removed on failure/close/teardown. Initial pending/loading waits are abortable. Explicit Retry preserves the selected Session ID and reacquires it through public `retain`; it cannot reread/adopt a changed association or surrounding Session. Both the owner error and scoped history error expose Retry. Explicit close ends that identity lifetime.

## Official API Evidence

Inspected checkout: `D:/programming/workspace/deepseek-harness`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`, package version `0.2.0-rc.2`. No tracked files in that checkout were edited.

| Source in the official checkout | Relevant behavior |
| --- | --- |
| `docs/subsystems/slots.md:75` | An explicit Provider reference overrides only its subtree; omission inherits surrounding selection. |
| `packages/client/ui-renderer/src/client/scoped-slots.tsx:503` | The supplied reference resolves through the Session adapter and is installed as subtree binding. |
| `packages/api/session-controller/src/client/contract/sessions.ts:25` | A reference owns a Client generation without Host Agent ownership; `retain`/`ready`/`release` are public. |
| `packages/api/workspace-controller/src/client/service.ts:35` | Public `WorkspaceSource.getSnapshot/subscribe` and `IWorkspaces.list` provide the archive feed, with an unsubscribe function. No refresh method is assumed. |
| `packages/api/workspace-controller/src/client/model.ts:32` | `archivedSessionIds` is registry-global; phase and state are separate. Baseline replacement is ready/idle; reconnect can leave ready/loading stale state. |
| `packages/api/workspace-controller/src/client/feed.ts:72` | Follow lifecycle invalidates the baseline on carrier loss and exposes terminal failures through the model. |
| `packages/api/session-controller/src/archived-session-gate.ts` | Host rejects model steps for archived Sessions independently of history opening; `openState: open` alone is not archive authorization. |
| `packages/client/ui-conversation/src/client/apply.ts:309` | Registers the native `conversation.content` factory and its transcript, composer chain, resident input and input dock children. |
| `packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx:21` | Embedded factory contains native Views, input, queued/dock content and pending-interaction composer routing. `hero: false` avoids a blank-session Workspace picker/navigation path. |
| `packages/client/ui-conversation/src/client/apply.ts:232` | Native Stop resolves the conversation service using the injected Session ID and calls its cancel operation. |
| `packages/client/ui-conversation/src/client/apply.ts:519` | Composer Stop callback closes over that scoped Session ID. |
| `packages/client/ui-approval/src/client/index.ts:91` | Approval renderer participates in the native session-scoped composer chain. |
| `packages/client/ui-user-questions/src/client/index.ts:294` | Question RPC explicitly carries the Session ID; its renderer contributes to the same composer chain. |
| `packages/client/ui-sidebar-right/src/client/session-view.ts:28` | Shipped sidebar is an existing independent-reference consumer; its committed mount lifetime informs this proof's release timing. |
| `packages/client/ui-dockkit/README.md` | Dockkit is explicitly an internal engine with unstable exports; the public additive overlay suffices for this proof. Full docking and floating management are deferred. |
| `packages/host/webserver/src/index.ts:4` | Web routes do not serve Desktop's file/IPC transport. This package must not claim Desktop acceptance. |

The same release label can cover source builds with different pre-stable APIs. Matching `0.2.0-rc.2` is not evidence that the running installation contains the extracted factory. This proof pins its Host peer, typechecks the inspected public declarations and exposes a missing-factory error. Actual installed artifact compatibility remains to verify.

## Checks

- Plugin ownership suite: 19 tests passed. Covers explicit ID acquisition, duplicate open, committed unmount release, StrictMode effect replay, pending metadata/history close, unavailable history, soft open failure, same-ID reopen and teardown; plus initial pending/error archive feeds, already archived/history-opening archive races, archive/feed loss while open, post-opening failure/removal, same-ID Retry and observer cleanup. Five regressions failed against the original owner before the fixes. These tests use controlled lifecycle interfaces and render no substitute chat.
- Plugin public declaration check: passed against the already-built official checkout with `DSH_SOURCE` and `scripts/check-source.mjs`.
- Host/browser build: passed with tsdown 0.22.2; expected `lib/index.js` and module-loader `lib/client.js` emitted. Expected warnings concern the legacy external option and required browser CJS wrapper.
- Built client assembly test: passed. Executes the module-loader artifact with real React modules, verifies effect-owned registrations and no implicit acquisition, opens only the configured synthetic teacher, and verifies the full native embedded factory call. A scoped failed-history render exposes Retry, which reacquires the same ID without another association request. It does not execute a Host/model conversation.
- Focused upstream checks: 4 files / 76 tests passed: SessionProvider, Stop sequencing, approvals, and user-question composer. The Provider negative cases deliberately log missing-adapter errors while the suite passes. A first sandboxed attempt failed when Vite needed a temporary config file; the narrowly escalated retry passed.
- npm pack: emitted a five-file archive containing `package.json`, `cordis.patch.yml`, `README.md`, `lib/index.js` and `lib/client.js`. No session fixtures, credentials, Kaogong data or source maps are in the archive. Limited installation results follow.

The upstream tests establish existing framework behavior; they are not an integrated test of this plugin in an installed profile. The plugin assembly test establishes delegation and package loading, not live model behavior.

## Disposable CLI Smoke: 2026-10-01

Read the actual launcher/plugin flags in `apps/cli/src/args.ts`, `plugin.ts`, `profile-boot.ts`, the CLI reference, and Web startup before running the built official `apps/cli/lib/bin.js`. All commands used a fresh working directory and explicit environment with `DSH_HOME`, user/config/cache/temp/state locations under:

`C:/Users/pc-zzy/Documents/ChatGPT/deepseek-harness/.scratch/personal-workbench/runtime-verification/ticket02-20261001`

No inherited provider credentials were supplied. Synthetic configuration used `teacherSessionId: synthetic-teacher-ticket02`, disabled telemetry entries, and set Agent Loop agents to an empty list. A Node preload rejected outbound HTTP/fetch and non-loopback socket connections. No prompts or provider calls were sent. Daily profiles, canonical Kaogong and official source were not changed.

The commands below are arguments to the official CLI. `<root>` is the disposable directory above; `<plugin>` is this worktree's `plugins/personal-workbench`. No authenticated browser session was attempted.

| Check | Exact result |
| --- | --- |
| `--version` | Exit 0, `0.2.0-rc.2`. |
| `--profile teacher-proof --from-default-profile web --dump-config` | Exit 0; created only the disposable Web profile. |
| First installer attempt with `--state-dir` | Exit 1; pnpm rejected the unsupported option. Corrected by using `XDG_STATE_HOME` in the isolated environment, not another CLI flag. |
| `plugin --profile teacher-proof add <plugin>/deepseek-ai-dsh-personal-workbench-0.1.0.tgz --offline --ignore-scripts --config.auto-install-peers=false --store-dir <root>/store --cache-dir <root>/cache` | Exit 1, `ERR_PNPM_NO_OFFLINE_META`: isolated cache lacked `@deepseek-ai/schemastery` 3.18.4 metadata. No online fallback. Tarball installation did not pass. |
| Same installer arguments with `<plugin>` instead of the tarball | Exit 0, pnpm 11.7.0; official installer added a local `link:` dependency and personal-workbench bundle to the disposable profile. Local linking passed, not archive installation. |
| `--profile teacher-proof --patch <root>/smoke.patch.yml --dump-config` | Exit 0; selected rows confirmed the synthetic association and telemetry disables. |
| `--profile teacher-proof --patch <root>/smoke.patch.yml --no-open --host 127.0.0.1 --port 0` | Host bound loopback port 13680 but warned `1 entry did not activate` and `personal-workbench (@deepseek-ai/dsh-personal-workbench): failed to import`. Import cause was not established. Plugin activation failed; server binding is not acceptance. |
| Unauthenticated Host-only HTTP probe of the association route | HTTP 401; no authenticated retry. This does not establish route registration or successful plugin activation. |
| Teardown | Stopped the recorded test child PID. Wrapper reported forced exit code 4294967295; wrapper completed. Verified owned PID absent and loopback port 13680 closed. No owned test service remains. |

Startup emitted an ephemeral authenticated bootstrap URL; it is omitted here and raw startup stdout was discarded rather than retained as evidence. No credentials or private conversation data are committed. The smoke check used the initial implementation artifact; subsequent archive/retry fixes were verified by focused tests, public types and rebuilt artifacts, not by another Host launch.

Browser localhost access previously returned `ERR_BLOCKED_BY_CLIENT`. That UI boundary was not circumvented. Full live UI/model acceptance remains pending. The initial Host import failure was subsequently diagnosed below; archive installation remains unverified. No broad CLI/registry changes or network configuration attempts were made.

## Narrow Import Diagnosis: 2026-10-01

Following the diagnosing-bugs loop, added `tests/host-import.test.mjs` and `npm run test:host`. It spawns a minimal-environment Node process, imports the actual `lib/index.js`, checks its public Host exports, and reports only error code/message with HTTP URLs omitted. It never boots the Host or sends a prompt. `HOST_ARTIFACT_URL` selects a different installed file URL for comparison. This is an installed-dependency check, not a replacement for installation and not satisfied by TypeScript path mappings.

The deterministic red command was `node --test tests/host-import.test.mjs` from the plugin directory: two consecutive runs failed in about 0.1 seconds with `ERR_MODULE_NOT_FOUND`, `Cannot find package '@deepseek-ai/schemastery' imported from .../personal-workbench/lib/index.js`. The same failure occurred through the disposable profile's linked entry URL and with the normal parent environment. Ranked hypotheses were missing dependency at the real link target, wrong selected artifact, invalid build imports/exports, and isolated-environment resolution differences; comparisons followed that order.

Concrete resolution evidence:

- The official installer wrote `link:` to this worktree's plugin. `createRequire` anchored at the disposable profile manifest resolved its Host entry to this exact worktree's `lib/index.js`, not a second installation.
- The Host artifact SHA-256 was `2d16ae209daa5758bbcab71ab95557359b657a76c2e89edc688000f6951e58ce`, unchanged throughout the dependency comparison.
- Schemastery did not resolve from that artifact location (`MODULE_NOT_FOUND`), while resolution from the official Web server package reached `D:/programming/workspace/deepseek-harness/vendor/schemastery/lib/index.cjs`. Its manifest supplies the ESM import entry `lib/index.mjs`, version 3.18.4.
- The dependency is already declared in this plugin's production manifest. Typechecking and bundling with external imports had not installed it. The local link does not populate dependencies at its source target, and the offline archive attempt could not install them because isolated cache metadata was absent.
- A temporary ignored junction at `<plugin>/node_modules/@deepseek-ai/schemastery` to that existing built vendor directory made the real import test pass without altering any artifact bytes, source files or package dependencies. Removing only this junction restored the built CLI's original inactive-entry/import warning; restoring it removed the warning again. Thus the original failure is an incomplete linked-package dependency environment, not malformed plugin code. No runtime fallback, bundled duplicate dependency, registry request or core edit was introduced.

Bounded launcher comparisons used the same disposable profile, synthetic patch, offline preload and explicit environment from the initial smoke check. The debug harness is `<root>/safe-host-check.mjs`. It discards stdout without retaining auth URLs, observes only selected stderr signals, waits for a loopback socket, then kills/awaits its exact child and verifies port closure. It uses port 13681 and returns JSON only. All subprocesses completed.

| Launcher and dependency environment | Result |
| --- | --- |
| Built `apps/cli/lib/bin.js`, dependency absent | Host listened; `inactiveEntryWarning: true`, `personalWorkbenchImportFailure: true`; child exited and port closed. |
| Built CLI, temporary existing-dependency junction present (two runs) | Exit 0 for smoke harness; `listening: true`, both failure flags false, `deniedOfflineOperation: false`, `childExited: true`, `portClosed: true`. Host child was deliberately terminated after the bounded observation, not reported as a natural success exit. This establishes startup without an inactive-entry warning, not live conversation behavior or authenticated route acceptance. |
| Source `apps/cli/src/bin.ts` under tsx/esm, dependency absent or present | CLI exited 1 before listening/activation: `SyntaxError: The requested module '@deepseek-ai/cordis' does not provide an export named 'FiberState'`. No offline operation was denied; child exited and port closed. |

For the source comparison, resolved `tsx/esm` from the official CLI installation to the installed tsx 4.22.4 ESM entry and supplied its absolute file URL to `--import`. This preserves the actual user's ESM loader while keeping the working directory synthetic; a bare loader name would instead resolve from the unrelated scratch directory. Node was v25.2.0. The source launcher imports `FiberState` at `apps/cli/src/profile-boot.ts:16`. Cordis resolution reaches `vendor/cordis/lib/index.js`, whose actual namespace has no `FiberState` export; `vendor/cordis/src/fiber.ts:147` defines it as a const enum. This is a source/transpiler versus built-package boundary before this plugin is evaluated, not evidence that this plugin needs a TS loader. The plugin Host artifact is plain ESM JavaScript. No DSH/Core rebuild or patch was performed.

Cleanup: removed only the checked scratch dependency junction (no recursive deletion and no vendor target deletion). The import test is intentionally red again in this dependency-free checkout; it passes in the verified provisioned fixture or a properly installed package. All bounded Host children exited, port 13681 closed, and no startup text/auth URL was written to disk. The debug harness remains only in the explicitly disposable runtime-verification directory. The offline cache gap and live UI gate remain separate pending checks.

## Remaining Acceptance

Verify packaged installation with complete dependencies in an appropriately isolated environment, then run the checklist in the plugin README. The linked Host import cause is established; its provisioned built-CLI startup passed, but source/tsx startup requires an upstream source/build-compatible environment. Verify actual teacher history, streamed responses, tool results, approval/question replies, simultaneous main/teacher work with teacher-only Stop, close while running, reopen, browser refresh, Host restart and continuation, missing/archived recovery, hot reload/disable and desktop/narrow Web screenshots. Use synthetic prompts and no private transcripts. Record exact installed revisions. Keep the original ticket unchecked until these tests pass. Only the disposable scratch profile changed; no daily profile, canonical Kaogong data, publishing branch or PR was changed.
