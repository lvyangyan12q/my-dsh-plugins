---
id: harness-rc3-role-catalog-critical-section
title: 私有角色目录完整生命周期串行化与冷恢复
parent: harness-rc3-kaogong-role-scope
labels: [ready-for-agent]
status: in-progress
implementation_status: production-source-integrated
acceptance_status: pending-new-w7-k6-installed-cold-editor
assignee: kaogong-cold-role-skills
blocked_by: []
target: 0.2.1-rc.3
---
# Role Skill catalogue stability during cold restore

## Reproduced defect

An application role inspection creates a temporary private Native scope, registers its Persona/Skills/tools, validates the catalogue and disposes that scope. Native's SkillRegistry revision covers all provider registrations, including private scopes. Concurrent inspections therefore changed that revision while another role or restored Agent requested a snapshot. Native exhausted its bounded stable-snapshot retries and correctly reported `complete: false`. Worktable then refused the role with `角色Skills目录不完整。` although its packaged files were present.

The real source and compiled Native compositions reproduced the same refusal with concurrent role inspection and existing-Agent validation. The expanded cold test persists an actual `/kaogong-teach` invocation and its Native-generated `skill-invocation` instructions, disposes the Agent, then uses the official API AgentController and real SQLite SessionQuery to restore it while opening/inspecting roles. Without the fix, concurrent inspection in this cold scenario reports the same catalogue error. The test does not claim to reproduce the browser's sticky editor error frame or every scheduling outcome of its failed resume; the final installed-browser cold-editor check remains required.

## Plugin-only change

`RoleSessionScopes` owns one catalogue critical section for application-owned scope work: temporary prepare, validation and disposal; Agent mounting and validation; current-Agent validation; and controlled private-registration release. The queue covers the whole temporary scope lifetime rather than only snapshot calls. Owner validity is checked again after waiting. A failed operation does not poison later operations, and queued work still fails closed after owner withdrawal.

No Native files, catalogue completeness rules, capability-provider checks, role identity, unknown creation intents or stored conversations change. Other providers can still report genuine incomplete observations; those remain refusals rather than falling back to a generic role.

## Verification

- Official rc.3 source and compiled entry tests pass, including physical duplicate-scope isolation, two distinct role personas, real Skill history replay and cold restoration, 12 concurrent role inspections, 24 concurrent read/assert operations, and normal unbound-Agent isolation.
- A real filesystem provider with a directory named `SKILL.md` reports an incomplete snapshot. Role read and Agent assertion still reject it; removing the broken provider restores access without restarting the queue.
- Related Worktable role/capability/lifecycle/navigation/UI regressions: 37 pass, 2 existing rc.2 conditional checks skip. Separate rc.3 source/compiled gates above actually run.
- No model request, formal-home change, running acceptance-instance operation or package replacement is performed by this slice. W.6/K.5 remain frozen; release and actual cold-editor validation must use new package versions.
