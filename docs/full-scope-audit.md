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