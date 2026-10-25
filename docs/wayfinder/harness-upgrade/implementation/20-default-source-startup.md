---
id: harness-rc3-default-source-startup
title: 官方默认源码启动的公开TSX配置兼容
parent: harness-rc3-kaogong-role-scope
labels: [ready-for-agent]
status: in-progress
implementation_status: production-source-integrated
acceptance_status: pending-clean-k7-install-and-stock-entry-browser
assignee: kaogong-default-tsx-config
blocked_by: []
target: 0.2.1-rc.3
---
# Official default source startup compatibility

## Defect and boundary

The official rc.3 `start:web` command is `node --import tsx/esm apps/cli/src/bin.ts web`. With no `TSX_TSCONFIG_PATH`, actual TSX 4.23.13 discovers Native's tsconfig and resolves its private scope to source code. K.6 recognized that source identity only with an explicit environment override, so the default official command incorrectly refused role creation with `NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED`.

TSX 4.23.13 bundles configuration discovery and does not expose an active-configuration accessor or declare get-tsconfig as its dependency. The plugin therefore declares its own exact public `get-tsconfig` dependency, `5.0.0-beta.5`, and uses `getTsconfig(process.cwd())` only to propose a configuration candidate when actual TSX activation has already been verified. This is not a claim to read TSX internal active state. An explicit environment override always takes priority.

Existing rc.3 version, installation metadata uniqueness, manifest version, configuration file containment, exact public source export mapping and actual Native preset/scope admission checks remain decisive. Missing configuration, invalid external mappings, unsupported configuration or a scope that fails Native's real admission probe remain refusals. A recognized compiled runtime returns before importing configuration discovery at all. No Native modification or hidden source-directory guess is introduced.

## Cost and verification

The pinned beta version is the actual locally available public package used by these tests; it was chosen for reproducible offline installation, not presented as a stable upstream release. Its declared runtime dependency is `resolve-pkg-maps ^1.0.0` (the tested physical tree uses 1.0.0). Its Node >=20.20 requirement is within the plugin's existing Node range. Configuration discovery performs a bounded-by-filesystem cwd/parent search only when needed; the role scope owner retains its resolved scope promise. No model or network operation is added.

- Red: compiled and explicit-source tests passed, stock source with no environment override failed at the actual role prepare operation.
- Green: four entry tests pass: plain Node compiled (configuration discovery import is forbidden), TSX compiled, explicit TSX source, and stock `--import tsx/esm` source from the Native root with the override unset. The full source cases include actual role personas, private Skill history replay, cold API restoration, concurrency and malformed Skill-directory refusal.
- Default discovery rejects a nearer external tsconfig with invalid installation mappings; a valid explicit override still succeeds from that cwd; a bad explicit override never falls back to automatic discovery. Existing missing/duplicate installation identity and physical duplicate-scope tests remain active.
- Official public Host declaration check passes.
- A separate physical temporary dependency tree containing this helper, public get-tsconfig 5.0.0-beta.5 and resolve-pkg-maps 1.0.0 manifests/dist files successfully recognizes stock source scope without development-ancestor resolution. This proves runtime resolution of that physical tree; it is not an official package-install or final browser acceptance claim.

K.6/W.7 remain immutable. K.7's clean official offline installation, lock receipt and actual stock-entry browser role restoration must be recorded by the release/acceptance slice before final delivery. No shared dependency install, formal configuration write or running instance change belongs to this patch.
