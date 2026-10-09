# Full-scope acceptance audit

Audit source: committed implementation e9220b27ac2266123021f58093e3a39cfb779298, 2026-10-10. Overall status: incomplete. This document indexes evidence and remaining verification; it does not replace the canonical specifications or close their tasks.

The [requirement inventory](evidence/2026-10-10/requirement-inventory.json) identifies each of 123 numbered/bulleted requirements by source, line and exact-text SHA256: all 36 Workbench and 28 Platform user stories, plus their implementation/testing decisions. Each still requires individual closure against its exact scope. Approved canvas changes, native-menu preservation, management-only public capability reuse, retained app-private capabilities, application-provided map data and the old-kaogong observation period remain part of scope.

| Requirement family | Inspected evidence | Limits / remaining proof |
| --- | --- | --- |
| Application registry, unique instances and availability | Current workbench, lifecycle and Client tests; installed release | Does not prove the complete sidebar teaching matrix |
| Draft, preview, explicit enable, disable/restore | application-platform-acceptance.md; final clean-source installed HTTP lifecycle | Historical real AI generation is separate from today's failed model route |
| Pages, layout, modules and templates | worktable-canvas-evidence.md; recipe-canvas/page-template/runtime-layout tests | Broad visual/keyboard gates require their own rendered observations |
| Independent data and declared connections | Reading release instance isolation; display/data-context tests and recorded actual filtering | Real maps remain explicitly deferred by the user |
| Reusable capabilities and app-private roles | Capability, management, native Skill and role tests | Four user-owned local management files are not included in the remote source proof |
| Native header, conversation, trace and shared composer | Actual 3080 screenshots/history; shared-composer.json; native package tests | Real physical IME across views, question cards, permission accept/refuse and Stop remain unproven |
| Teaching and practice | Recorded single-classroom teaching chain; standalone-kaogong-browser.json | One real chain plus synthetic standalone practice does not prove all three sidebar environments |
| Material/table/image/source preservation | Actual returned material screenshot; browser image dimensions; legacy-upgrade-release.json | These do not replace all required cross-page material framing/keyboard observations |
| Retention, recovery and uninstall/reinstall | Current old-to-new archive check; clean-source platform release | Historical and current receipts must be distinguished by source/artifact identity |
| Annotation point/rectangle, requirements and screenshots | Recorded persistence/draft chain; 3080 point/editor/cancel reconfirmation | Latest point probe was cancelled; it created no new annotation or model request |
| Independent standalone keyboard window | standalone-keyboard-browser.json and narrow JPEG; red/green built regression | Synthetic isComposing event is not physical IME acceptance |
| Remote deliverable | remote-committed-source.json; exact remote branch identity | A pushed commit and passing tests do not close the remaining runtime gates |

## Current independent source proof

A git archive of the exact pushed commit excludes all user uncommitted files. With existing public development dependencies, all three plugin Host/Client/type/consumer builds pass, followed by 285/285 tests. The newly added keyboard regression is included. The final installed archive check passes exact product bytes, public consumers, compatibility with zero exemptions, authenticated lifecycle, cold restart, Reading uninstall/reinstall and scoped HTML assets. The [receipt](evidence/2026-10-10/remote-committed-source.json) records those boundaries. This is not fresh registry dependency-resolution proof.

The local integrated suite remains 286/286. Its extra test is the user's uncommitted Agent-library inventory-ownership test. None of the four user management files was staged or overwritten; their synchronization fingerprints remain unchanged. Do not cite 286 as the remote-only test count.

## Current external blocker

The existing default teacher's empty native composer received two explicit system-only ask_user_question probes. The displayed DeepSeek V4.1 Flash and separately selected DeepSeek-V41-Flash both ended with native AUTH and the same upstream subscription payment-authorization failure. No question card appeared. The original DeepSeek V4.1 Flash / Default selection was restored; provider configuration, credentials and study data were unchanged. Failed prompts remain in native history. The [recheck receipt](evidence/2026-10-10/native-question-recheck.json) does not certify successful teaching or question interaction.

The current external state prevents real question, permission and model-running Stop/close acceptance. No further retries are justified until credentials/provider state or an authorized usable route changes. The pending user request for a restored subscription or existing usable route remains unresolved.

## Completion frontier

1. Finish the same complete teaching workflow with no Better Sidebar, compatible Better Sidebar 0.24.1 enabled, and adapter disabled. Existing install/toggle/layout proofs cover only parts of this matrix.
2. Complete actual role-scoped question response, permission accept/refuse, running Stop and close-without-cancel/streaming-state acceptance after a usable model route is available.
3. Complete remaining material framing, desktop/narrow focus and physical IME observations at the required scope; retain exact screenshots and interaction results.
4. Reconcile every inventory entry and original/local ticket checkbox with scoped current evidence, update the existing PR description, and confirm final remote delivery. Do not close tasks based only on this inventory, historical prose or test totals.

The goal remains active. No request to delete old materials, merge the PR, or declare the implementation complete is inferred.
Incremental update (2026-10-10): [standalone responsive receipt](evidence/2026-10-10/standalone-study-responsive.json) closes the observed 480px retained-column defect and standalone material selection/return focus defect. Actual narrow and desktop dimensions, loaded image and inner Escape/launcher return are verified in the officially installed isolated 3088 build. Local integrated 287 tests and final release gates pass; this does not close the sidebar teaching, physical IME, model question/approval/Stop or other full-scope requirements.

Incremental update (2026-10-10): [formal background-refresh receipt](evidence/2026-10-10/formal-background-refresh.json) verifies current 3080 narrow content/native-header and actual material selection, retained controls through refresh, and one real lazy image. A refresh-remount focus defect was fixed with a failing/passing regression. Integrated local 288 tests and release gates pass. Formal screenshot timed out; remaining original-scope requirements stay open.

Incremental update (2026-10-10): [formal public-material focus receipt](evidence/2026-10-10/formal-public-material-focus.json) closes the separate Workbench-backed Return-to-list focus defect. Actual 3080 Return/search focus and Escape/launcher return pass; integrated local 289 tests and final release gates pass. Formal screenshot still timed out; broader keyboard/error/IME and model/environment requirements remain open.

Incremental update (2026-10-10): [outer-retention receipt](evidence/2026-10-10/formal-outer-retention.json) verifies explicit-entry focus, same selected-material/idle-role DOM nodes, same native Session IDs and exact draft hashes through outer close/reopen on current 3080. Requirement inventory stories 9 and 13 now link this bounded partial proof; running-agent, Host persistence and reload-layout scope remains separately open. No implementation changed or tests repeated.

### 2026-10-10：最新远程提交的独立源码验收

从已核对远程分支的 fa100cb18ec6eab3074d2824f751087edc2ed88e 导出干净源码，排除四个用户未提交的 Agent 管理文件。三个插件 Host/Client 构建、类型声明与消费者检查通过，288/288 测试通过，无跳过。官方离线归档安装、产物字节核对、认证生命周期、冷重启、阅读应用卸载重装及 HTML 静态资源检查通过。四个用户文件哈希与保存基线相同。详见 [本次独立验收记录](evidence/2026-10-10/remote-committed-source-final.json)。

验收使用现有开发依赖和合成安装数据，模型调用为零；没有补齐真实原生提问/审批/停止、全部侧栏教学环境或物理输入法的验收。先前 e922 的记录保留作为历史证据，不代表本次源码。整体目标继续保持未完成。

Incremental update (2026-10-10): [formal module-layout reload receipt](evidence/2026-10-10/formal-layout-refresh.json) verifies keyboard 50→55 resize, same iframe on focus, then full-browser-reload restoration of 55% and focused module, unchanged four draft hashes and three native Session IDs. Layout restored to original 50%/unfocused after acceptance. Story12 is partial for module layout, not all outer window geometry/tabs. Story32 is individually reconciled with the officially uninstalled Workbench/standalone Kaogong material/practice/browser proof and built missing-factory regression; model-backed teaching remains separately open. No implementation changed or test suite repeated.
