# Ticket 02: Native Teacher Session Evidence

Status: implementation candidate; real-host acceptance pending. **Do not check ticket 02 as complete or unblock dependent tickets on this evidence alone.** No fundamental Web API blocker was found in the inspected official source. Desktop integration remains unsupported by this proof.

## Implementation

`plugins/personal-workbench` is an independent installable bundle. The Host registers one read-only association route. The association is the configured existing teacher Session ID, persisted in the official profile configuration. The client contributes one footer launcher, one additive overlay and a strict Session child slot. It acquires a `personalWorkbenchTeacher` reference, awaits real history opening, and supplies it explicitly to the renderer-provided `SessionProvider`. Beneath that Provider it renders the native `conversation.content` factory in embedded/active mode. There are no business runtime imports from other UI plugins, DOM transfers, copied histories, custom chat components or custom send/stop/approval implementations.

Closing withdraws the UI target before committed unmount releases its reference. Pending acquisitions release immediately on close. The generation guard prevents a late metadata/history response from reopening a closed or superseded window. Duplicate opens acquire once. Plugin disposal releases references idempotently. Unavailable associations/history stay explicit errors with Retry; no create/adopt/fork fallback exists. The fixed association is sufficient for this ticket's explicit-session proof, but is not the later general application/role storage model or teacher provisioning workflow.

## Official API Evidence

Inspected checkout: `D:/programming/workspace/deepseek-harness`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`, package version `0.2.0-rc.2`. No tracked files in that checkout were edited.

| Source in the official checkout | Relevant behavior |
| --- | --- |
| `docs/subsystems/slots.md:75` | An explicit Provider reference overrides only its subtree; omission inherits surrounding selection. |
| `packages/client/ui-renderer/src/client/scoped-slots.tsx:503` | The supplied reference resolves through the Session adapter and is installed as subtree binding. |
| `packages/api/session-controller/src/client/contract/sessions.ts:25` | A reference owns a Client generation without Host Agent ownership; `retain`/`ready`/`release` are public. |
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

- Plugin ownership suite: 10 tests passed. Covers explicit ID acquisition, duplicate open, committed unmount release, StrictMode effect replay, pending metadata/history close, unavailable history, soft open failure, same-ID reopen and teardown. These tests use controlled lifecycle interfaces and render no substitute chat.
- Plugin public declaration check: passed against the already-built official checkout with `DSH_SOURCE` and `scripts/check-source.mjs`.
- Host/browser build: passed with tsdown 0.22.2; expected `lib/index.js` and module-loader `lib/client.js` emitted. Expected warnings concern the legacy external option and required browser CJS wrapper.
- Built client assembly test: passed. Executes the module-loader artifact with real React modules, verifies effect-owned registrations and no implicit acquisition, opens only the configured synthetic teacher, and verifies the full native embedded factory call. It does not execute a Host/model conversation.
- Focused upstream checks: 4 files / 76 tests passed: SessionProvider, Stop sequencing, approvals, and user-question composer. The Provider negative cases deliberately log missing-adapter errors while the suite passes. A first sandboxed attempt failed when Vite needed a temporary config file; the narrowly escalated retry passed.
- npm pack: emitted a five-file archive containing `package.json`, `cordis.patch.yml`, `README.md`, `lib/index.js` and `lib/client.js`. No session fixtures, credentials, Kaogong data or source maps are in the archive. Installation was not performed.

The upstream tests establish existing framework behavior; they are not an integrated test of this plugin in an installed profile. The plugin assembly test establishes delegation and package loading, not live model behavior.

## Remaining Acceptance

Run the checklist in the plugin README against a disposable Web profile and the packaged archive. Verify actual teacher history, streamed responses, tool results, approval/question replies, simultaneous main/teacher work with teacher-only Stop, close while running, reopen, browser refresh, Host restart and continuation, missing/archived recovery, hot reload/disable and desktop/narrow Web screenshots. Use synthetic prompts and no private transcripts. Record exact installed revisions. Keep the original ticket unchecked until these tests pass. No runtime profile, canonical Kaogong data or PR was changed by this implementation.
