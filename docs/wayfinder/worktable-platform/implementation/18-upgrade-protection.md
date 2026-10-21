---
id: worktable-framework-18
title: 应用升级与迁移影响确认
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_failures
blocked_by: [worktable-framework-12, worktable-framework-16]
---

# 18: 应用升级与迁移影响确认

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

补未知/不兼容应用定义升级停止与旧数据保全；owner迁移计划明确业务影响、revision/版本及是否不可逆，显式确认后才执行；失败保留恢复入口，不承诺不可逆数据自动回滚。平台只管理合同，应用执行实际业务变更；旧考公数据不碰。

## Acceptance

- [ ] 公开生命周期/迁移计划合同，真实独立应用升级失败与可验证恢复；合成owner迁移验收不等于旧资料整体迁移完成。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [12](12-composed-authoring.md)
- [16](16-failure-states.md)


## Candidate implementation — source validation only

Ticket remains open until the release owner installs the new official archive and records actual user-flow acceptance. Worktable 0.8.0, Notes/Reading 0.2.0 archives remain immutable. The 0.8.2 candidate owns an independent `migrations.v1.json` schema1 ledger; it does not reuse application schema4 or modify business schemas itself.

### Public owner contract and scope

`application-migration-v1` is optional. Trusted applications contribute `worktableMigrations` owners with supported application versions, read-only `inspect(instanceId)` (data version + business revision), frozen-version `plan`, revision-checked `execute`, and optional revision-checked `recover`. Owners perform business work in their own lease. Inspect must be safe inside resource authorization callbacks and must not recursively acquire that same business lease. Execute/recover validate expected revision atomically before writing. Owners must not route their own inspection/recovery through their blocked consumer API.

Existing instances have no provable old definition version. They begin `legacy-unverified`; a new declaration is never silently adopted as an old baseline. After read-only inspection, explicit adoption confirms the exact current declaration/data version/revision and writes metadata only. This does not migrate records or certify other instances. Existing apps without owners retain their existing behavior; they are not promised read-only behavior or managed upgrade protection. Reading, Notes and Kaogong remain unmodified legacy consumers pending separate owner adoption.

Managed gating is deliberately conservative and application-wide. Each call inspects all explicitly adopted baselines for that application. Any unsupported definition, missing owner, schema drift, failed migration or durable executing/recovering intent blocks the entire app's new instances, role ensure, prepared task submit and platform resource access. Resource guards independently check consumer and source owner apps. It does not certify unadopted instances as migrated. The UI discloses this cross-project suspension before adoption and plan confirmation. Existing native history open/handoff and Stop remain available; historical reads of a merely disabled app retain the previous contract. Native plugin-manager replacement and trusted owner private HTTP/native-code writes cannot be vetoed by this plugin and are outside this admission fence.

Plans freeze source/target application + business versions, business revision, baseline revision and owner generation, and disclose business impact, irreversibility and recovery instructions. Preparation does not execute. Confirmation needs an impact acknowledgement and a separate irreversible acknowledgement. Durable execution intent is written before owner execution, with no automatic replay after process death. Interrupted intents present as unknown and fail closed. A failed owner leaves instructions and an explicit recovery entry; verified recovery must prove either the old or target version endpoint. Irreversible data is never promised automatic rollback.

### Source evidence and reproducible commands

- `node --test plugins/worktable/04_test/migrations.test.mjs`: explicit adoption; incompatible/unknown definition preservation; separate irreversible confirmation; real synthetic file partial failure + explicit recovery; actual child process killed after durable intent and reopened without replay; public protocol; owner-generation invalidation.
- `node --test plugins/worktable/04_test/migration-http.test.mjs`: authenticated public Host route, blocked actual instance creation and future-ledger schema rejection preserving old application/ledger bytes. This is a source Host test, not an installed-runtime claim.
- `node --test plugins/worktable/04_test/migration-resource.test.mjs`: RED missing rejection, then GREEN source/consumer read/write refusal and recovery; owner-held lease + durable intent + authorization callback completes without a platform-gate deadlock.
- `node --test plugins/worktable/04_test/migration-panel.test.mjs`: RED missing module, then GREEN closed panel issues no request; read-only opening; explicit current-baseline acknowledgement; no automatic execute.
- `node --test plugins/worktable/04_test/migration-example.test.mjs`: independent example versions build to final server/client factories, only React external on client, real owner synthetic checkpoint failure → explicit verified recovery → newly prepared and confirmed success. This is not installed UI acceptance.

The early REDs also observed missing protocol feature, missing owner contract execution/recovery, and missing Host migration route before each corresponding minimal implementation. Final result and exact release/archive evidence will be appended after the release owner runs the new candidate. Source fixtures never modify user profiles or ACLs.

### Installed acceptance preparation

Independent test-only example: `plugins/worktable/04_test/fixtures/migration-owner/README.md`. Root release owner builds separate version1/version2 directories and archives, installs them only into the dedicated acceptance profile after candidate Worktable installation, and records archive hashes, public dependency/runtime versions and screenshots. One synthetic instance only; no model or user data needed. Required remaining checks: actual adoption warning, managed cross-project admission blocking, plan impact/irreversible acknowledgement, first deliberate failure, restart persistence and explicit owner recovery, newly prepared second success. Do not close this ticket from source results alone.


Final source gate: 206 tests passed, zero failed/skipped, with `WORKTABLE_NATIVE_RC2_ROOT` set to the independent official rc.2 source. Candidate 0.8.2 `npm run build` and `npm run check` passed. The compatibility list now includes the previously omitted composition and actual storage-refusal tests as well as all five new migration test files. No archive was created or installed by this implementation task. Full machine-readable source receipt: [18-source.json](evidence/18-source.json).
