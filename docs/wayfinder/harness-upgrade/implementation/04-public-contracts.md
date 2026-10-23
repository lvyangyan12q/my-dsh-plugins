---
id: harness-rc3-public-contracts
title: 固定 rc.3 原生公开配置与声明门禁核对
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: []
target: 0.2.1-rc.3
---

## Scope

在已确认的公开配置、角色能力与兼容检查接缝上补充 rc.3 专用核对。产品起点 `d97d7e0774dc4bc30add299015fe3213f9f38dd9`；只读原生检出固定为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` / `0.2.1-rc.3`。本票只关闭公开契约核对，不关闭 HU01、HU07 或完整安装验收。

新增 `plugins/worktable/04_test/native-rc3-contracts.test.mjs`，通过 `WORKTABLE_NATIVE_RC3_ROOT` 显式选择原生检出，不借用旧 `WORKTABLE_NATIVE_RC2_ROOT` 跳过项作证据。未设置变量时该组明确 skip；本次独立命令已设置，结果无 skip。

## Reproduce

先将 `$nativeRoot` 设置为已正常官方构建的原生检出绝对路径，将 `$node` 设置为符合宿主要求的 Node 可执行文件绝对路径。从产品仓库根运行：

```powershell
$env:WORKTABLE_NATIVE_RC3_ROOT = $nativeRoot
$env:TSX_TSCONFIG_PATH = Join-Path $nativeRoot 'tsconfig.json'
$loader = ([System.Uri](Join-Path $nativeRoot 'node_modules/tsx/dist/loader.mjs')).AbsoluteUri
& $node --import $loader --test plugins/worktable/04_test/native-rc3-contracts.test.mjs
```

测试内部首先核对原生 HEAD 和根包版本。2026-10-24 实际 Node 为 `v25.2.0`，使用该原生检出的官方依赖与已构建模块。没有新增 node_modules junction、修改原生源码或 lib，也没有启动 profile。

## Results

9 个测试计数全部通过，0 failed、0 skipped；`git diff --check` 通过。

- 实际已构建 registry 公共入口导出的 `entryListProblem` 接受 `managedAgentDefinition` 的精确五层声明；缺 name 的负对照被拒绝。
- 通过该原生包显式导出的 `./src/*` 子路径执行 `definitionComposition`，得到五个预期模块及 `enabled: true`。这是声明源码核对，**不是实际激活状态**。此源文件需要官方 tsx 加原生 tsconfig 解析路径与 const enum；裸 Node 直接导入会因 `FiberState` 类型擦除而失败，不能据此称原生运行时失配。本测试没有补丁、私有 definitions Map 或伪装的 fiber 状态。
- 五个实际原生插件的公开 `Config` schema 均接受管理器生成的配置：文件、检索、提问、Skill、persona。每个插件包均断言版本 `0.2.1-rc.3`。检索空配置的负对照因缺 `sampleOverCapGlobResults` 被拒绝，生成的显式 `false` 被保留。
- 执行官方 `evaluatePluginCompatibility`，不传豁免。当前 Worktable 的 DSH peer 为 `*`，声明检查通过；这不是完整兼容声明。Notes `0.2.1` 被 `dsh-storage-domain` 的旧范围拒绝。Reading `0.2.2` 被 `dsh-host-webserver` 和 `dsh-storage-domain` 的同一旧范围拒绝。三项未满足范围均为 `0.2.0-rc.2 || 0.2.1-alpha.2`。测试固定这些实际事实，没有放宽范围。

## Remaining

这些检查不创建 Agent、不激活五层工具、不运行模型，也不安装最终包。Cordis/Schemastery 的 npm 依赖约束另于 DSH 声明门禁，未被此纯函数测试证明可安装。Notes/Reading 仍待其适配、新版包与真实 SDK 使用流程验收。最终原生执行、角色挂载状态、输入、持久化、卸载重装和模型闭环仍按主规格验收。

## Resolution

补齐固定 rc.3 的独立可复现公开契约检查，并记录当前消费者的精确声明拒绝；旧 rc.2 的两个可选检查保持其历史版本边界，不计为本次通过。
