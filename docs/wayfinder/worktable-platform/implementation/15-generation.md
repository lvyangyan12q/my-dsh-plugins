---
id: worktable-framework-15
title: 原生AI生成追改与稳定产物归属
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: continuation_failures
blocked_by: [worktable-framework-14]
---

# 15: 原生AI生成追改与稳定产物归属

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

复用原生任务/标注/产物握手，新增组合应用版本、实例、页面、模块、请求身份；描述生成、自定义页面追改、显式结果应用/失败重试。停止/取消/关闭/替换和迟到结果不重放、不覆盖替换目标；产物和原生轨迹保留，不写其他模块或原生。

## Acceptance

- [x] F09实际模型、原生轨迹/问题/审批/Stop及目标替换负例；辅助安装产物回调验证边界，不能单用fixture关单。
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [x] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [14](14-inline-builder.md)


## Candidate0.9.0 — source implementation, ticket remains open

Generation is a separate profile-owned metadata ledger (`generations.v1.json`, schema1). It fixes project/app/instance/view/page/module, instance revision, draft recipe revision/version, running version and module fingerprint. The approved output root is resolved from the declared role and verified native binding cwd; the module UI displays it for explicit acknowledgement. Browsers/manifests cannot choose another root or Session. New generation requests revoke predecessors without stopping native work or deleting outputs. A moved view retains its identity; replaced/removed module, changed recipe, reassociated instance or replaced role binding rejects the old task/output.

Preparation creates an owned TaskDirectory row and canonical output instructions. It never sends. Existing TaskPanel opens for review/edit and the separate native-send action; no second conversation composer or direct prompt endpoint was added. Generated task IDs, Session and generation IDs are fixed during prepare; the native request ID is created only by the existing submit operation and linked through the durable task record. The manifest carries generationId/taskId/sessionId, not an invented pre-submit native request ID.

Result checking uses public `sessionController.inspect(sessionId)` after public persistence flush. The matching `user/message.data.source.rpcId` locates the submitted request's turn; only its explicit `turn/end.data.reason.kind === completed` permits file inspection. Missing facts remain pending; aborted/error/unknown endings revoke applicability. Completed is not treated as business success: manifest identity, real files, hashes and explicit human preview/apply are still required. No native SQLite/storageDomain table or private state is read. TaskPanel/historical Stop revokes managed applicability before native cancel; external native Stop is rejected through its corresponding aborted turn fact. Closing a view revokes its live UI callback epoch, does not auto-Stop, and cannot automatically mount/apply a late reply; reopening requires explicit result checking again.

The approved root's `.worktable-generated/<generationId>/result.json` is the only accepted manifest, limited to16KiB. Its HTML artifact must be an existing ordinary `.html`/`.htm` file within that exact generation output directory, at most1MiB, with matching SHA256. Actual realpath checks cover directory junction escape before creating output and before/after reads. Preview records exact manifest/artifact hashes; apply revalidates target, role, request outcome and file bytes. Only the selected module's draft config changes through recipe OCC; running recipe/version activation remains explicit and requires its normal version increment. Durable `applying` is never replayed automatically if a draft commit result becomes uncertain.

Generated HTML uses opaque-origin `sandbox=allow-scripts` without same-origin or host DOM access, plus a restrictive inline CSP (no network connections/child frames/forms/base URLs). Rendering an applied generation uses the dedicated hash-checked result API rather than the general file endpoint. This contract does not make arbitrary generated HTML automatically match host themes: self-contained generated pages must explicitly implement their requested light/dark/responsive design; real browser checks remain pending.

### Metadata rollback boundary

Only TaskStore explicitly supports schemas1/2. Ordinary RoleStore/capability stores remain schema1. The first owned preparation task upgrades its task metadata file to schema2, so the old0.8.4 reader cannot silently ignore preparation guards after rollback. Existing unmanaged task files stay schema1. Restoring an older plugin must retain and refuse this new file; never clear, downgrade or replay it automatically. This is platform metadata compatibility, not business migration. The source gate executes the actual historical0.8.4 public RoleStore code from commit6e63ea3, observes `schema-incompatible` and unchanged bytes, then reopens through the current TaskStore with its owned task intact. Actual frozen-old-package user-path refusal is still a final acceptance item.

### Source checks and installed handoff

TDD slices observed RED missing generation service, then GREEN native preparation with zero prompt calls and stale-module submit refusal; next RED missing preview, then GREEN real HTML/manifest preview and explicit draft apply without changing running. Further public checks cover wrong Session, outside-root files, post-preview byte mutation, real junction escape, native aborted fact, Stop, owner unavailable, persisted preview reopen and new-generation lateness. HTTP rejects arbitrary root/Session fields and cross-instance IDs. UI confirms visible approved root, preview and separate apply; no submit/activate request is issued.

`generation-installed.test.mjs` executes the actual final full ModuleLoader client factory with exact external dependencies and public fake host/HTTP boundaries, opens a real composition custom module, checks root acknowledgement, prepares once and observes the existing TaskPanel wake. It does not prove a running installed DSH or actual model execution. This script is part of the unique release gate against the installed package's client.js; source tests are also included. No package is created or installed by this task.

Root real-model steps: create one new synthetic composition with custom module + declared role/cwd and native role Session; enable it. Open AI生成与追改, read/confirm displayed root, describe generation, prepare only. Review existing AI任务 and explicitly send. Use native question/approval/trajectory/Stop controls as required. Ask the model to write self-contained HTML then result.json (schema1, generationId/taskId/sessionId/artifactPath/actual byte SHA256) under its fixed output directory. On corresponding completed turn, explicitly check/preview; explicitly apply to draft; edit draft to a newer recipe version, preview and enable separately. Then trace a follow-up generation, native other-entry Stop and replaced-target late-output negatives, refresh/cold restoration. Only synthetic files under the root; no Kaogong or user materials. Keep this ticket open until archive/runtime/model/UI evidence is recorded.


Final candidate source gate:227/227 passed, zero failures/skips with official rc.2 parser enabled. Build/check and full final client factory module callbacks passed. Managed task schema2 is sticky after discard and later ordinary preparation. [15-source.json](evidence/15-source.json) records source scope; actual installed/model/user-flow evidence is still pending and this ticket remains open.


### Superseding source correction: pathless, instance-local generation bindings

Review found two blockers in the initial9e35e7 candidate, which was not installed/released. First, persisting a raw artifactPath beside generationId let the old0.8.4 renderer bypass the new managed hash/CSP path. The actual historical public CompositionCanvas produced one raw-file fetch (RED); after removing raw artifactPath, generationId and artifactSha256 from shared config, it produces no fetch/iframe and explicitly refuses the missing path (GREEN), including replacement of a module that already had a legacy path. Output paths remain only in the private generation ledger/manifest.

Second, recipe definitions are app-wide and cannot own an instance's private generation. Shared custom config now contains only generic `managedGeneration:true` plus ordinary presentation config. AppStore optional `generatedBindings` owns per-instance/page/module draft and active generationId/hash references. Generation draft apply updates recipe marker and that instance's draft binding in one existing application-store transaction. Explicit composition activate with a verified current viewId publishes only that instance's eligible draft→active references in the same recipe transaction; other instances remain unchanged. Activate without viewId preserves its old structural workflow and publishes no instance pending reference. A binding-only explicit activation can keep the recipe version when its structure is exactly unchanged; structural changes still require a newer version. No schema5/business migration was added; existing application schema3/4 validates the optional references, while the old renderer remains pathless/fail-closed.

The public artifact API resolves only `{viewId,pageId,moduleId}` to the current instance active slot; it never takes a private output ID/path from the renderer or guesses old files. Module reorder with stable page/module identity retains the slot; changing/removing managed/custom marker denies display. Explicit activation updates all rendered views of that instance through a scoped event; other instances do not refresh/replace content. Preparing/stopping a new generation, or applying it only to draft, cannot revoke the prior already-active result. Old applicability and active historical reading are distinct.

Public real-file A/B source flow verifies A G1 active; A G2 prepare/Stop retains G1; A G3 draft still G1; B has a distinct Session and does not inherit A; B draft does not become active; global activation without view publishes neither pending reference; B explicit activation changes only B; A explicit activation then changes only A. Reordering retains both, replacing the module rejects both old outputs. Final factory script now also renders the active managed artifact via the instance-slot API and opaque CSP frame. Actual installed cross-instance/model flow remains root acceptance, not source completion.


Pending publication also has a trusted generation-owner admission seam: under the existing reentrant platform gate, it validates the private ledger, exact role/Session/task and public native completed-turn facts plus unchanged file hashes. The recipe OCC/current pending references and owner generation are rechecked in the commit callback; a synchronous revoked-set check rejects a Stop that arrived before commit. No second lock or alternate execution channel is used. Missing owner refuses pending publication, while old ordinary/no-view structural activation remains compatible and never silently publishes pending bindings. Stopping an applied-but-not-enabled generation removes its future application right; already-active historical output remains readable through its active reference and hash checks. RED missing pending-Stop rejection became GREEN.

Generation UI now resets busy/error/notice/requirements/root acknowledgement on view identity changes and isolates requests by identity plus open-lifetime epoch. Delayed A preparation first reproduced retained A requirements (RED); switching to B now clears and enables B independently, and A's late response cannot update it. Closing/reopening the same module also invalidates old callbacks without replaying native work or retaining a stuck busy flag. These are actual component callback tests, not real browser/model acceptance.


Corrected final source gate:234/234 passed with zero failures/skips; actual complete client factory pathless artifact/module callbacks and build/check passed. A public concurrency test delays native inspect during activation, completes Stop without waiting on the platform gate, then verifies the final commit rejects and preserves running/active. Instance-only binding activation can keep the recipe version when structure is identical; only structural changes require version increments. Root actual A/B/model/old-package acceptance remains pending.


### Confirmation precondition correction (2026-10-22, source only)

A public stale-confirmation test reproduced preparation after replacement of the acknowledged role binding (RED). Describe now returns a nonsecret exact optimistic-precondition fingerprint covering the target/recipe revision, role definition, binding revision/Session and canonical declared/binding roots. Prepare compares it and rechecks current facts before any output directory, generation row or task is created. Changing binding, recipe or canonical role root rejects with unchanged directories/rows/tasks; a new describe/acknowledgement succeeds. A ready binding with `roles.read.unavailable` also refuses before writes. This fingerprint does not grant authority or choose a root.

Module UI refreshes describe and clears acknowledgement after related application/role changes; unrelated instance role events do not replace this confirmation. Prepare errors require current metadata and acknowledgement again. Actual component callbacks verify the new fingerprint is sent. Final source gate:237/237 passed, zero skips/failures; build/check and the complete final client factory/UI script passed. Ticket15 remains open pending root installed/model acceptance.


### Cross-instance in-flight correction and candidate0.9.1

Private generated bindings still increment the shared application-store OCC revision. A new public test reproduced B publication incorrectly invalidating A in-flight output (RED). Current generation identity now compares the complete shared draft/running structure fingerprint (including versions and role declarations), stable slot and instance identity, while retaining the original revision for audit. Private binding-only changes cannot invalidate another instance's native result; real shared structure/version changes still refuse. Preview stores the then-current revision separately, and apply must match both that explicit preview and current OCC. An intervening B publication rejects stale apply without losing A's result; explicit re-preview allows a new application attempt.

The real-file public flow verifies A active plus A in flight, B independent prepare/preview/apply/activate, another B publication between A preview/application, preserved A active until explicit own activation, and final separate A/B outputs. The actual UI callback sends the preview revision instead of original generation revision. Candidate0.9.1 integrates bridge46578522 with preparation-owner/web-source, runtime, SDK feature and gate unions; tracked package/manifest/lock identities agree. Combined source gate257/257 passed with no skips/failures, build/check and final generation client factory passed. No pack/install/model execution was performed;15 stays open.


### Pending candidate structure correction

A legal replacement role after draft application originally allowed the maker output to activate under other-maker (public RED: missing expected rejection). Instance draft bindings now persist the SHA256 of the exact post-apply module and selected role declaration. Activation passes its candidate recipe into the trusted generation owner and refuses changed roleId, module config or selected role declaration before publishing. Active artifact reads also verify this slot structure, so changing it cannot silently retain an incompatible generated display. The recipe version and module position are outside this slot fingerprint: normal required version increments, stable moves and other-instance private binding OCC remain compatible.

Public real-file tests retain running and absent active binding across each refusal, then restore the original post-apply structure with a newer version and publish successfully. Candidate0.9.1 combined source gate258/258 passed, zero skips/failures; build/check and final generation client factory passed. No actual installation/model claim; ticket15 stays open.


### Candidate0.9.3: Host-hashed manifest and independent navigation lifetime

The actual installed model role may have read/write/search without shell. The source contract now prefers manifest schema2 containing only generationId/taskId/sessionId/artifactPath (no sha256). Host preview computes SHA256 from bounded real HTML bytes and persists both artifact and manifest hashes; apply/active reads retain their exact unchanged-byte checks. Schema1 remains supported with required matching supplied hash; schema2 rejects a sha256 property to avoid ambiguity. Real-file RED schema2 refusal became GREEN; changing HTML or manifest after preview still refuses application, and schema1 wrong hash still refuses. No extra native capability or manual hash is required.

A separate actual component RED reproduced unresolved navigation holding TaskPanel busy and disabling Stop. Task ownership HTTP validation still runs first; opening the native UI is then observed asynchronously rather than holding task-operation busy for its returned lifetime. Stop stays actionable, and late navigation failure cannot overwrite a different view. This does not infer whether the installed route was uiWorkspace or a fallback; official rc2 openSession is void. Root still owns actual installed navigation/Stop verification.

After integrating032a7d64 bridge grant UI, candidate0.9.3 package/manifest/lock identities agree. Combined262/262 source tests, zero skips/failures, build/check and complete generation client factory passed. No pack/install/model send by this source task;15 remains open pending root actual acceptance.


## Actual official installation acceptance — 2026-10-22

Closed for ticket15 scope using [15-installed.json](evidence/15-installed.json), independently separating262 source checks from actual official rc.2/Worktable0.9.3 user-flow evidence. Frozen archive SHA256 `57222fda4d6f4b9310e42baa2c1648372f5ea26a2dc2ae9f049a9497b15abd5b`; public peer check found no issues. Historical0.9.1 G0 hash blockage and explicit Stop remain a failed run, not retrospectively successful.

Root actually verified native question→answer→HTML/schema2 manifest→preview→draft→separate enable, independent A/B Sessions and output ownership, B publication while A in flight, G2 directed Stop, and G3 draft preserving old active until explicit same-version1.0.1 enable. Both A views then shared G3 SHA `ea30ae1548e77b104324977dcb5b0c949ba3a2bb97d21d3dc92d982b78319cdb`, while B retained `a87d92807b72ba1031a079e8b79f75dec78ac81c3cee49ad4f7b5cdc0de5350a`. G4 real model output after UI target replacement was refused by explicit preview; applicability was explicitly revoked and original draft restored. G5 was stopped through the native composer; matching aborted-turn preview refused and active G3 remained unchanged.

Independent Chrome actual TaskPanel preparation/review/send loaded text-organize through native Skill, and exercised separate single-operation native Reject and Allow once write approvals using only synthetic markers. Denied marker remained absent, allowed marker exact bytes were verified. A mistaken unsupported permission-enum prompt caused no write and is retained as setup failure. Native access mode stayed Workspace Write; no global permission/grant changed. TaskPanel Stop remained actionable after native navigation and during waiting approval.

This closes15 only.17 and19 remain open. Final19 cold recovery, actual frozen-old-package refusal/restore, final narrow/theme/keyboard cross-feature UI, storage/editor recovery, target3080 host compatibility, review/mapping and delivery remain pending. Original titlebar/image/IME/device/legacy/kaogong limitations remain; no historical172 mapping changed. No source fixture is presented as real installed acceptance.


## Review correction pending actual0.9.4 recovery

The earlier0.9.3 installed evidence remains a record of the actual completed flows; it did not cover a storage-refused draft application leaving a durable `applying` generation. Review and root later reproduced this gap. Ticket15 is reopened for this explicit failure-recovery obligation;19 remains open and historical acceptance JSON is unchanged.

Candidate0.9.4 adds an explicit recovery action, not automatic retry. It revalidates exact target, role/Session/native completed request and preview file/manifest hashes, then reads the durable instance binding. If no binding references this generation and the complete original target structure is unchanged, recovery returns only to prepared; the user must preview again and explicitly apply. This safely handles a real0.9.3 applying record lacking new fields after a definitely uncommitted failure. If a draft binding already references this generation, the new durable apply intent must match its exact recipe and slot/hash before marking the record applied; no composition transaction is replayed. A legacy uncertain committed record lacking sufficient intent is blocked with explanation. Stop, changed target/files/roles, missing owner or indeterminate binding remain fail-closed. Active historical output is retained.

Source regression runs use actual OS rename refusal on independent temporary files: historical0.9.3 creates the old applying record; new owner explicitly recovers without another native prompt. Another real composition commit followed by actual ledger-write refusal is reconciled after owner reopen with no extra recipe revision or enable. UI/final factory callbacks expose recovery only by explicit action and scope late callbacks to the current view. Actual root0.9.4 recovery of G6 remains pending; this source correction does not close15.


## 2026-10-23 actual0.9.4 failure-retry verification

Root officially installed frozen0.9.4 (SHA256 c40c0c550cc1fa4c55f54eb695c712c58609b82bd82c52c920f5ca081aa1aff6;9/9 bytes). Historical0.9.3 G6 applying was explicitly reconciled in the real module UI to prepared, previewed again, then explicitly applied to draft revision24 from23. Running G3 stayed unchanged until separate editor preview/save/enable produced version1.0.1 revision27/G6. All seven native task/request pairs remained identical; B1 remained unchanged. Official same-package remove/add and cold reload retained G6 and its original two views, with the same seven requests and artifact hash. Frame-local button state reset is not claimed as persistent application data.

This closes the reopened explicit failure-retry seam only. [19 interim installed evidence](evidence/19-final-interim-installed094.json) contains sanitized hashes and distinctions between actual UI and source gates.19 and the full spec remain open; formal3080 is still0.7.2, pending usable native host and final mapping/delivery.
