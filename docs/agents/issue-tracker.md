# Local Task Tracking

The user chose local numbered tasks for this project, not remote issue IDs. Review a ticket against [the shared spec](../personal-workbench-spec.md) and its evidence below; do not infer completion from a commit or draft PR.

| Local task | Scope | Evidence |
| --- | --- | --- |
| 01-05 | Reusable Kaogong view, native classroom proof, application workspace, integration, optional sidebar | [API](../workbench-api.md), [Kaogong](../ticket04-kaogong-evidence.md) |
| 06-07 | Native classrooms and per-key role ownership | [06](../ticket06-classroom-evidence.md), [07](../ticket07-roles-evidence.md) |
| 08 | Durable scored practice and counselor handoff | [08](../ticket08-practice-evidence.md) |
| 09 | Agent/Skill catalog and native assignments | [09](../ticket09-management-evidence.md) |
| 10 | Durable lessons, tasks and continuation | [10](../ticket10-homework-evidence.md) |
| 11 | Release packaging, public types, preservation and final gates | [11](../ticket11-release-evidence.md) |

Task11 acceptance requires both installed sidebar modes, desktop/narrow visual checks and actual native interaction gates. Its current status is partial draft. The working task checklist lives in the user's local harness workspace under `.scratch/personal-workbench/issues/11-release-verification.md`; its absence in another checkout is not a remote tracking reference.

## Application platform specification

Local task identity: `12-application-platform`. Title: 工作台应用平台：应用配方、模块联动与角色会话.

- Canonical implementation issue and full specification: [工作台应用平台规格](../wayfinder/application-platform/platform-spec.md).
- Triage label: `ready-for-agent`; status: open; unassigned. Ready means planning and testing boundaries are confirmed, not that implementation is complete.
- Decision provenance: [应用组合与角色绑定：原型先行的决策地图](../wayfinder/application-platform/issues/map.md).
- Prototype source: `codex/prototype-application-platform` branch, isolated from production implementation.

The implementation issue uses Markdown frontmatter as the local tracker metadata. Its body follows the to-spec template and is the sole source of the specification; do not copy it into another task file. Existing tasks 01–11 retain their own scope and acceptance status.
## Application platform implementation graph

The approved seven vertical slices are tracked locally at `.scratch/application-platform/issues/README.md` (one file per ticket, blockers listed by title). The implementation branch is `codex/application-platform`. Work only on the frontier, preserve each task's acceptance evidence, and do not infer completion from a commit. The user supplied origin https://github.com/lvyangyan12q/my-dsh-plugins. The single implementation PR is https://github.com/lvyangyan12q/my-dsh-plugins/pull/2; local tickets remain the task source. The user confirmed c44d9af as the final review baseline.

## Worktable canvas implementation graph

The eight approved follow-up slices are tracked at [.scratch/worktable-canvas/issues/README.md](../../.scratch/worktable-canvas/issues/README.md), one Markdown file per ticket. They replace the concentrated creation form with layout-first module configuration while retaining DSH native menus, the independent upstream Worktable, existing app-private capabilities and the user's Agent management edits.

Dependencies: 01 → 02 → 03; 03 → 04 and 06; 02 → 05; 04/05/06 → 07; 02–07 → 08. The four packaged workbench Skills are module generation, page adjustment, data display and application building. Final acceptance includes real native conversation/trajectory interactions, 3080 plugin provenance and preservation checks, and remote delivery to the existing repository and PR.

As of 2026-10-09, layout/module generation, persistent annotation, native session views and shared composer ownership have implementation and individual acceptance evidence in docs/worktable-canvas-evidence.md. Installed standalone Kaogong browser practice/recovery also passed. Full completion remains unproven: real native questions/approvals/Stop, the complete three sidebar-environment teaching matrix, broader visual/focus gates require their own evidence. Current legacy archive upgrade, cold restart and uninstall/reinstall preservation passed separately; see docs/evidence/2026-10-09/legacy-upgrade-release.json. Ticket status and unchecked acceptance criteria are authoritative. The isolated 3086 prototype is not the deployable plugin. Do not infer completion from prototype behavior, build success or a commit.


## Current original-scope audit

See [full-scope audit](../full-scope-audit.md) and its 123-entry canonical requirement inventory. Exact remote implementation b7ba8f7 passes three clean builds, 293 tests and exact installed-archive checks independently of four retained user management modifications. The old-to-current data upgrade proof remains separately scoped to b42d3f7. Clean-source counts exclude the four retained local user management modifications. The fixed-true dependency defect is repaired; actual isolated installed-browser managed Agent/Skill dependency recovery now passes at its catalog/view scope; native model/Session recovery remains separate; the additive public sidebar.sections seam and real short viewport menu preservation now pass (see the latest scoped receipts). Latest clean source and same-capability browser acceptance are recorded in live-capability-browser-recovery.json. Native question rechecks still fail with upstream payment authorization. No original task is closed by this index.

## Current delivery boundary (2026-10-10)

[PR2](https://github.com/lvyangyan12q/my-dsh-plugins/pull/2) now states the current implementation and evidence boundaries, verified by API readback. Local platform07 is in-progress: early completed platform milestones remain historical, while current native model/permission/Stop, full teaching environments, physical IME, screenshot upload and remaining visual gates remain open. Canvas08 marks only actual submission/push/PR recording as delivered; other unchecked acceptance items remain. Evidence: [PR reconciliation](../evidence/2026-10-10/pr-delivery-reconciliation.json). The canonical123 requirements are unchanged; neither a pushed commit nor PR metadata constitutes full acceptance.

## Workbench completion planning (2026-10-10)

The user confirmed the full destination and installed-DSH user-flow testing seams. [工作台完整闭环与交付规格](../wayfinder/workbench-completion/spec.md) is a supplemental ready-for-agent implementation spec; it preserves the original 123 requirements. [工作台完整闭环与交付决策地图](../wayfinder/workbench-completion/map.md) tracks unresolved route decisions separately. Its child frontmatter uses parent, labels, status, assignee and blocked_by; query open unclaimed children whose blockers are closed. Local tracked docs are used as in the earlier application-platform effort, avoiding an ignored-only planning artifact. Wayfinder tickets carry only wayfinder labels, never ready-for-agent. Map completion is planning completion, not implementation acceptance. Historical maps and user edits remain intact.

## Worktable 基线定位与实现路径

用户确认以 Worktable 为代码基线后，新的[基于 Worktable 的 AI 应用工作台定位与实现路径](../wayfinder/worktable-platform/map.md)采用同一本地 frontmatter 跟踪约定。仅已确认的基线决策关闭；产品定位仍待讨论，后续工单通过 blocked_by 排列。旧规格、123项要求及历史验收保持，不据此宣布实施完成。

## Worktable AI 框架规格

本地规格身份为worktable-ai-framework-spec，标题为[基于 Worktable 的 AI 工作台框架与应用接入规格](../wayfinder/worktable-platform/framework-spec.md)。遵循现有frontmatter跟踪；用户已确认真实安装用户流程为主验收入口；当前status=open、唯一triage标签ready-for-agent。规格已发布到本地跟踪器，不把规划资产或提交记录当实施完成。

Worktable框架规格已按grill-with-docs首轮确认区分首阶段与后续阶段。原14张实施工单仅为未批准草案，须据新边界重排后再发布；本轮只记录决策与ADR，不发布实施工单。

## Worktable首阶段实施图

用户在implement-spec轮明确确认按[首阶段11张实施工单](../wayfinder/worktable-platform/implementation/README.md)发布。集成分支codex/worktable-framework；保留原型评审门槛及真实安装验收，完整搭建器、高级网页桥接和自动追改保留后续。原14张草案未作为实施工单发布；旧规格与旧工单不关闭。

## Wayfinding operations：Harness 升级与考公接入

新的本地地图是[工作台与考公面向新 Harness 的兼容及迁移路线](../wayfinder/harness-upgrade/map.md)，不替代旧 framework spec 或历史验收。子票存放在同目录 issues/，以 frontmatter 的 id 为身份，parent 指向 harness-upgrade-map；只能使用 wayfinder 标签。各票 blocked_by 引用实际子票 ID，本地跟踪器无独立依赖 API，因此以该字段表达阻塞。

查询运行 `docs/wayfinder/harness-upgrade/frontier.ps1`；加 `-All` 同时显示认领和阻塞。前沿为 open、assignee 为空且所有 blockers 均 closed 的子票。先设置 assignee 再工作；研究可并行，其他类型每轮最多解决一个。结论写票内 Resolution（本地的 resolution comment），随后设 closed、清除 assignee，再给地图追加标题链接与摘要。研究报告留在票内 context_branch 指定的独立 research 分支，推送但不合并或建 PR，Resolution 链接精确提交。

## 旧规格与工单的 rc.3 增量记录

[框架规格 HU01—HU08](../wayfinder/worktable-platform/framework-spec.md#host-upgrade-requirements)持有升级详细要求；[实施索引](../wayfinder/worktable-platform/implementation/README.md#host-upgrade-followups)映射原票。旧票的 status、blocked_by 与历史勾选继续表示原阶段，新增 followup_target/status/blocked_by 仅记录升级待办；pending-decisions 不属于可直接领取的实施前沿。当前需先解决 harness-upgrade 地图中的开放决策，随后另行发布可执行升级子票，不把闭合历史票当作新宿主已完成。
