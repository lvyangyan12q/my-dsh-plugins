# Personal Workbench: Teacher Session Proof

Ticket 02 implementation candidate, **not runtime accepted**. This package contributes an official sidebar footer launcher and an additive `shell.overlay` window. It retains one configured Session and renders the official `conversation.content` factory beneath an explicit `SessionProvider`. It does not implement chat, submit prompts itself, move DOM, change main selection, or modify Kaogong.

## Scope and Compatibility

Source target: DSH `0.2.0-rc.2`, official checkout commit `639ed015397290b3745d163aafe02ffee4aa3f84`. The native factory and explicit-reference Provider are pre-stable APIs: the version label alone does not establish that another installation contains these APIs. The Host peer is pinned to this version and missing native rendering shows an error instead of a substitute chat. Dependencies on chat, approval and user-question renderers are declared in the client manifest.

This proof targets the **Web profile**. Its read-only association route uses the official `webServer`; Desktop's file/IPC transport is not verified or supported by this proof. Better Sidebar adaptation, docked/floating window management, automatic teacher creation, teacher presets/Skills, and general role association storage remain separate tickets. No teaching Skill or persona is claimed to be installed.

The teacher Session ID is persisted in the official Host plugin configuration, not browser storage. It must identify an existing accessible, unarchived test Session, preferably distinct from the main Session. The public Workspace feed must have an authoritative ready/idle baseline before opening. Archive, feed loss, removal or history failure withdraws the native view. Retry retains the exact selected identity without rereading the association; the plugin never creates a replacement. Explicit close/reopen reacquires the configured ID. Releasing the Client reference does not call Host cancel/archive/delete. DSH owns history, streaming, drafts, tools, approvals, questions, running state, and Stop. Native Stop cancels the addressed current turn; DSH may still process already queued work.

## Build and Package

With this package's development dependencies installed:

```sh
npm run build
npm test
npm run typecheck
npm run test:artifact
npm run test:host
npm pack --ignore-scripts
```

`prepare` builds both faces from a source checkout. The npm tarball includes the ready-to-load Host ESM entry, browser module-loader entry, bundle patch and README. It excludes source maps, sessions, fixtures, credentials and Kaogong data. Install the built archive through the official plugin installer; it needs no source build.

Against an already-built official checkout, `DSH_SOURCE=/path/to/deepseek-harness node scripts/check-source.mjs` checks this plugin's types against that checkout's public declarations. Generated check configuration stays in ignored `.checks/`. It never launches or mutates a profile.

`test:host` imports the real built Host entry in a subprocess with no inherited provider environment; it does not boot a Host. Unlike public declaration checks, it requires actual installed runtime dependencies. `HOST_ARTIFACT_URL` can select an installed artifact's file URL. An installer `link:` to a source directory does not supply that directory's dependencies: install them at the link target before expecting a native Node import to work. A profile-level dependency elsewhere or typecheck path mapping cannot satisfy that import.

## Isolated Runtime Acceptance

Use a disposable Web profile, synthetic prompts and a harmless test workspace. Install with the official command `dsh plugin --profile <disposable-profile> add <path-to-this-built-package-or-tgz>`. Configure the inserted `personal-workbench` Host row's `teacherSessionId` to the synthetic teacher Session ID using official profile configuration. Leave the running profile and canonical Kaogong untouched. Do not commit this local ID or test conversation.

1. Keep main Session A open, configure teacher B, click Open teacher twice. Confirm one window, native history and input, and unchanged main selection.
2. Send a synthetic question in B. Confirm B's actual streaming answer and tool result render inside the window; A's history remains unchanged.
3. Trigger a harmless approval and an ask-user question in B using available official tools. Answer in the native controls. Check each interaction reaches B alone. Also exercise approval Escape handling: the window must not consume the native rejection shortcut.
4. Run a long synthetic turn in A and B. Click native Stop in B. Confirm B stops and A continues. Continue B in the same window and confirm prior context.
5. Close B's window while B runs. Confirm closing does not cancel it. Reopen and confirm the same Session and its latest history/status.
6. Refresh the Web client and restart the disposable Host. Reopen and continue B with its previous history. Repeat with B archived or unavailable: show an explicit error; never silently substitute another Session.
7. Disable/re-enable or hot reload the plugin. Confirm one launcher/window, no stale reference, no implicit prompt, and no changed main selection. Verify desktop/narrow browser layouts and native content with screenshots.
8. Repeat using the packaged artifact through the standard installer. Record exact Host/client revisions and results before checking ticket 02 or unblocking dependent tickets.

Only a disposable scratch profile was installed for a limited CLI smoke check. Local linking passed; offline tarball installation lacked cached dependency metadata. The initial Host import failure was traced to absent Schemastery at the source link target. Providing the existing built dependency as a temporary scratch-local junction made the unchanged artifact import and the built CLI start without inactive-entry warnings. The source/tsx CLI separately fails on Cordis's erased `FiberState` const enum before plugin activation. No plugin logic or DSH source fix was needed for these environment boundaries. All test services were stopped and the temporary junction removed. Real model streaming, runtime tools/interactions, close-during-run continuation, refresh/restart continuation and visual acceptance are still outstanding; these checks do not satisfy that acceptance gate. See [proof evidence](../../docs/teacher-session-proof.md).
