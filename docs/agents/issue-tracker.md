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

The approved seven vertical slices are tracked locally at `.scratch/application-platform/issues/README.md` (one file per ticket, blockers listed by title). The implementation branch is `codex/application-platform`. Work only on the frontier, preserve each task's acceptance evidence, and do not infer completion from a commit. This repository currently has no remote; a real draft PR cannot be created until a destination exists.