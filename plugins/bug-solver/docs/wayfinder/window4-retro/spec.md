---
id: window4-retro-spec
title: 窗口4 复盘与知识回流（bug-solver）规格
labels: [ready-for-agent]
status: open
kind: implementation-spec
parent_map: window3-dispatch
created: 2026-10-27
---

# 窗口4 复盘与知识回流（bug-solver）规格

> 本轮统一开发入口为[可靠性修复、同步优化与窗口4收集复盘规格](../../specs/bug-solver-next/spec.md)。冲突项按该增量处理，历史规格和验收状态保留；未决产品范围仍由决策票收口。

> 2026-10-28 范围复核：用户明确本期只收集、复盘与知识沉淀，为后续流程优化留资料，不做质量评分或流程比较。当前文件是既有规格，知识库解析、会话来源及材料归属需按 [增量草案](collection-draft.md) 和 [co-dev能力对照](speckit-capabilities.md) 协调；开放决策见 [地图](map.md)，不可将旧稿全部视为已对齐的实施指令。

## 变更记录

- 2026-10-27：独立窗口4（p4）；语料集中；外部知识库按目标仓库 `.claude/settings.local.json` 解析；复盘对比 plan 与实际；复用 speckit `spec-retro`。

## Problem Statement

窗口3 的审核 ↔ 修复循环结束后，用户需要复盘：这次改动质量如何、开发流程哪里可以优化、哪些经验值得沉淀、哪些 skill/流程该改。现在这些信息散在 spec、git 分支、diff、审核结论和两个 DSH 会话里；没有固定的复盘入口，也没有把“这次怎么改的”变成下一次可复用的知识和语料。

用户希望有一个独立的复盘窗口：在循环结束、合入前，看到对应的 spec、分支、commit、每轮 diff 与审核结论，产出一份可编辑的复盘，沉淀项目知识、外部知识库候选和改进提案，并把本次代码/上下文归档成后续迭代可用的语料。

## Solution

窗口4 是复盘与知识回流窗口。它按 run 列出已通过审核的运行，读取目标仓库的 speckit spec、分支、commit、diff、每轮产物和两个会话的元数据，启动一个按需的复盘 DSH 会话（复用 speckit `spec-retro` 方法）生成复盘草稿；用户在窗口里编辑、确认、归档。

复盘遵循 speckit `spec-retro` 的既有约定，不另造一套复盘框架：

- 经验分类：经验与方法 / 领域知识 / 方案设计知识 / Skill 效果 / Hook 观察 / 代码质量。
- 每条结论保留“发生了什么、原因/未知、适用条件、行动、来源”。
- 写回唯一归属：feature 的 `reports/retro.md`、`docs/domain/`（已确认规则）、`specs/maintenance/retro/retro.md`（无 feature 时）。
- 外部知识库只在显式操作时写；普通复盘只产出候选。
- skill/流程优化用 `spec-optimize`，只提案，不自动改。

窗口4 另建一份**跨 run 的语料**（spec/plan/tasks、每一轮的方案与实现、diff、review、retro、变更文件、meta），默认放 `bug-solver` 项目的数据目录，脱敏、只读、可索引；不导入完整会话日志，不默认当训练数据。

外部知识库地址按**目标项目**解析：优先读目标仓库 `.claude/settings.local.json` 里的 `SPECKIT_KNOWLEDGE_ROOT` / `DCOM_KNOWLEDGE_ROOT`，其次读进程环境；读不到就只产候选。每个项目可以有自己独立的库地址，窗口4 同时显示“本项目解析到的库”状态。

## User Stories

1. 作为缺陷处理人，我希望循环结束、合入前能从窗口3 一键进入复盘窗口，以便趁上下文还新鲜时复盘。
2. 作为缺陷处理人，我希望复盘窗口只列出已通过审核的 run，以便不把半成品当复盘对象。
3. 作为缺陷处理人，我希望看到本次对应的 spec 文件/章节，以便知道改动依据。
4. 作为缺陷处理人，我希望看到 spec 的 git 变更与所在分支，以便知道 spec 本身有没有漂移。
5. 作为缺陷处理人，我希望看到分支、base、commit 列表和完整 diff，以便复核代码改动。
6. 作为缺陷处理人，我希望看到审核 ↔ 修复每一轮的审核结论和 blocking 项，以便复盘返工原因。
7. 作为缺陷处理人，我希望看到本次改动的文件、测试结果和耗时，以便评估代码质量和流程成本。
8. 作为缺陷处理人，我希望一键启动复盘会话，让它按 spec-retro 方法生成复盘草稿，以便不用从零写。
9. 作为缺陷处理人，我希望复盘草稿按“经验与方法/领域知识/方案设计知识/Skill 效果/代码质量”分类，以便结构一致。
10. 作为缺陷处理人，我希望每条结论都有来源和适用条件，以便以后能判断能不能复用。
11. 作为缺陷处理人，我希望在窗口里直接编辑复盘，而不是去改 Markdown 文件，以便快速收口。
12. 作为缺陷处理人，我希望复盘写回目标仓库的正确位置（feature `reports/retro.md` 或 maintenance retro），以便仓库自己保有归属。
13. 作为缺陷处理人，我希望已确认的领域知识能更新到 `docs/domain/`，未确认的只留候选，以便不把猜测写成规则。
14. 作为缺陷处理人，我希望看到“可复用的经验/方法”候选，并能批准写入对应 skill/规则，以便下次同类问题少走弯路。
15. 作为缺陷处理人，我希望 skill/流程改进以提案形式列出（目标文件、改法、预期收益），由我批准后执行，以便复盘不把流程改坏。
16. 作为缺陷处理人，我希望看到外部知识库候选，并在显式点击“沉淀”后预览、写入，以便不自动外发项目内容。
17. 作为缺陷处理人，我希望外部知识库未配置时明确提示，而不是假装写入成功，以便知道实际状态。
18. 作为缺陷处理人，我希望本次的 spec/diff/review/retro/变更文件自动归档到语料目录，以便后续迭代检索。
19. 作为缺陷处理人，我希望语料按 runId 隔离、脱敏、带 meta，以便不串数据、不泄密。
20. 作为缺陷处理人，我希望看到语料索引和本次 run 的 manifest，以便知道归档了什么、缺了什么。
21. 作为缺陷处理人，我希望复盘会话能读取绑定的 fix/review 会话记录（有界、增量、需我授权），以便复现决策过程。
29. 作为缺陷处理人，我希望复盘能对比每一轮的“方案计划”和“实际实现”，以便发现计划偏差和返工原因。
30. 作为缺陷处理人，我希望复盘窗口按目标项目解析外部知识库地址（`.claude/settings.local.json`），以便每个项目用自己的库。
22. 作为缺陷处理人，我希望不授权时复盘只读项目产物，不扫我的全部历史会话，以便保护隐私。
23. 作为缺陷处理人，我希望复盘窗口显示“哪些材料没读到/没归档”，以便知道结论的证据边界。
24. 作为缺陷处理人，我希望复盘失败、会话中断、文件不可写时窗口显示真实原因，以便重试或手工处理。
25. 作为缺陷处理人，我希望复盘窗口不影响窗口3 的运行状态，也不自动合入或改代码。
26. 作为缺陷处理人，我希望窗口4 是独立 HTML 窗格，刷新后保留，以便和窗口1/2/3 并列使用。
27. 作为缺陷处理人，我希望复盘窗口不自动提交 git、不自动 clear 会话、不新增审查轮次，以便复盘本身不成为负担。
28. 作为缺陷处理人，我希望旧 run（窗口3 上线前）也能手工导入复盘，以便不让历史数据失效。

## Implementation Decisions

### 总体架构

- **独立窗口4**（新 pane，HTML + dshell 皮肤 + 工作台 v2 清单）；窗口3 在 `approved` 后显示「去复盘」，带 runId 进入。
- **复用同一个 Host 桥插件**，新增 `/api/bug-solver/retro/*` 路由；窗口4 用 `fetch` 调桥，不直连文件系统。
- **复盘会话按需启动**：一个 DSH 原生会话，workspace = 目标仓库，加载/阅读 `spec-retro` 方法；不参与审核 ↔ 修复循环，也不新增子代理。
- **方法复用 speckit `spec-retro`**：分类、证据字段、唯一归属、外部知识显式写入，全部照该 skill 的约定；窗口只提供 UI、编排和语料归档。
- **按项目解析外部知识库**：先读目标仓库 `.claude/settings.local.json` 的 `SPECKIT_KNOWLEDGE_ROOT` / `DCOM_KNOWLEDGE_ROOT`，其次进程环境；解析不到时只产候选。写库必须显式点击、预览，并遵循目标库的 knowledge-curation 规范。
- **不自动改 skill/流程**：改进提案由 `spec-optimize` 或人工执行，复盘窗口只收集和展示。

### 数据与文件

`RetroRunView`（窗口4 读取）：

```json
{
  "runId": "uuid",
  "bugUid": 3083,
  "title": "BUG-3083 ...",
  "approvedAt": 0,
  "specRef": { "kind": "file|url|none", "path": "specs/<feature>/spec.md", "feature": "<feature>" },
  "branch": "bugfix/3083-<runId>",
  "baseBranch": "master",
  "commits": ["..."],
  "changedFiles": ["..."],
  "rounds": [{ "round": 1, "planPath": "round-1/plan.md", "planApprovedAt": 0, "verdict": "request_changes", "blocking": ["..."], "commit": "..." }],
  "sessions": { "fix": "uuid", "review": "uuid" },
  "artifacts": ["round-1/plan.md", "round-1/diagnosis.md", "round-1/diff.patch", "round-1/review.md"],
  "knowledgeBase": { "resolvedFrom": "project|env|none", "root": "<path>|null", "available": true },
  "retro": { "state": "pending|running|done|failed", "sessionId": null, "reportPath": null, "candidates": 0 }
}
```

- **spec 解析**：优先 `specRef.path`（相对目标仓库）；没有则从 `specs/*/spec.md` 里按 run 的 feature/spec 选择；再没有就标 `none`，复盘只按 diff/缺陷描述。
- **目标仓库写回**：
  - 有 feature：`specs/<feature>/reports/retro.md`。
  - 无 feature 但有持久复用价值：`specs/maintenance/retro/retro.md`。
  - 已确认领域规则：`docs/domain/`（按项目现有导航）。
  - 不改代码、不提交 git、不 clear 会话。
- **语料（central corpus）**：`bug-solver` 项目数据目录下 `retro/corpus/<runId>/`，包含 `meta.json`、`spec.md`、`plan.md`、`tasks.md`、`diff.patch`、`review/round-N.md`、`retro.md`、`changed-files/`（可选）、`README.md`；`retro/corpus/index.json` 是索引。默认只读、脱敏；不导入完整会话日志。
- **外部知识库**：先按目标项目解析 `<KB_ROOT>`（`.claude/settings.local.json` → 进程环境）；显式「沉淀」时按 `spec-retro` 的 external-knowledge 约定，读 `<KB_ROOT>/wiki/_master-index.md` 与 `knowledge-policy.md`，预览候选，再写文章和索引；不复制整份 spec/diff。只读需要的 env 键，不打印其他设置和凭据。

### 复盘会话

- 启动参数：runId、目标仓库 localPath、specRef、branch/base/commits、每轮 plan/artifact 路径、fix/review session id、是否允许读会话记录。
- prompt 要求：先读 `spec-retro` skill（优先目标仓库 `.claude/skills/spec-retro/SKILL.md`，其次用户全局 speckit 插件缓存，最后项目内 vendored 副本）；按分类产出 `retro.md` 草稿；对比每轮 plan 与实际 diff；只引用实际读到的材料，未读的列“未处理”；区分方案目标与已验证实现；不自动写外部库、不自动改 skill。
- 会话记录：默认不读；用户勾选后才用 `.specify/scripts/retro_context.py bind/read` 做有界增量读取；不扫全部历史。
- 失败：会话失败、文件不可写、skill 缺失时状态 `failed` + 原因；保留已生成草稿。

### 窗口4 页面

- 顶部：标题、run 选择、状态徽标、刷新。
- 概览：缺陷摘要、spec 链接/内容、分支/commits、改动文件、轮次（方案 vs 实际）、耗时、审核结论。
- 知识库状态：本项目管理库地址（来源 + 是否可用）、候选数、上次沉淀时间。
- 复盘编辑：分类分区（经验/领域/方案/Skill/代码质量），每条带来源和适用范围；保存到目标仓库 retro 文件。
- 知识候选：项目领域知识候选（写 `docs/domain` 需确认）、外部知识库候选（预览/沉淀）。
- 改进提案：目标文件、改法、预期收益、优先级；批准后交给 `spec-optimize` 或单独 DSH 会话执行。
- 语料：本次 manifest、索引、缺失项；一键归档/重建。
- 空态/错误态/桥不可用/外部库未配置明确。
- 轮询：复盘会话运行时 1.5s，空闲 10s。

### 挂载

- 窗口4 作为新 pane（p4）挂载：新 HTML 页面 + pane-p4 的 v2 清单；布局需加一个窗格（默认放 `leftMore`，与窗口2 并列）。窗口1/2/3 不变。
- 桥插件新增路由不改变现有窗口3 行为；卸载后窗口4 显示「桥不可用」。

## Testing Decisions

- **接缝 A：`RetroService`（主接缝）**：注入 fake `SessionGateway`、fake `FileGateway`、fake `Clock`，覆盖：
  - run 选择与状态过滤（只允许 approved）；
  - spec 解析与缺失；
  - 复盘会话启动/停止/失败；
  - 写回路径选择（feature vs maintenance）与不可写；
  - 外部知识库未配置/预览/写入；
  - 语料归档 manifest、缺失材料、脱敏。
- **接缝 B：窗口4 页面**：沿用既有 `dev-preview-*.cjs` fake fetch + 截图；覆盖 run 列表、spec 视图、轮次、复盘编辑、候选/提案、语料、空/错/未配置状态。
- **接缝 C：语料与文件**：临时目录测 `corpus/<runId>/` 结构、索引、脱敏、只读 manifest；不测具体 Markdown 文案。
- **先例**：window3 的 `DispatchService` fake 测试、`scripts/dev-preview-ssh-config.cjs`、speckit 的 `test-retro-context.py` 与 `spec-retro` 方法。
- **验收**：真实挂载窗口4；从窗口3 的 approved run 进入；生成 `reports/retro.md`；语料归档可查；未配置外部库时明确提示；不自动提交/不改代码。

## Out of Scope

- 自动改 skill / AGENTS.md / 流程文件（只提案）。
- 自动写外部知识库（必须显式预览+写）。
- 完整会话日志导入语料；训练数据生成。
- 自动 git 提交、自动 clear、新增审查轮次。
- 多用户协作、权限系统。
- 窗口4 的实时协同编辑。

## Further Notes

- **speckit-retro 来源**：`spec-retro` skill 由 speckit 插件提供（Claude 插件缓存 `normal-plugins/speckit/0.1.0/payload/.claude/skills/spec-retro/`），目标仓库通常有 `.claude/skills/spec-retro/SKILL.md` 与 `.specify/` 脚本；DSH 当前未安装同名 skill，复盘会话以“读文件并按方法执行”的方式复用，不依赖 Skill 工具。
- **外部知识库按项目配置**：每个目标仓库的 `.claude/settings.local.json` 可设置 `SPECKIT_KNOWLEDGE_ROOT` / `DCOM_KNOWLEDGE_ROOT`；未配置的项目只产候选。当前 bug-solver 项目自身没有 `.claude/settings.local.json`，所以“本项目”解析可能为空，以目标仓库为准。
- **p4 布局**：已确认独立窗口，默认加在 `leftMore` 与窗口2 并列；需要新增 pane 清单与布局改动。
- **历史 run**：窗口3 上线前的 run 没有 spec/rounds 元数据；窗口4 支持手工补充 spec/分支后再复盘。
- 复盘方法不新增 agent/hook/审批链；窗口4 的复盘会话是“主会话”形态，不是子代理。
