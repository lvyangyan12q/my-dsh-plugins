# Worktable 派生基线

## 当前派生版本 · 2026-10-20

当前实现为Worktable0.7.2；插件包根仍是`01_content/`。公开SDK协议v1、精确9文件打包约束及运行边界以[SDK合同](../../docs/wayfinder/worktable-platform/implementation/10-sdk-contract.md)为准；下文0.4.0/7文件等为最初基线记录。完整接续见[交接](../../docs/wayfinder/worktable-platform/handoff.md)、[技术路线与待办](../../docs/wayfinder/worktable-platform/technical-roadmap.md)及[首阶段验收](../../docs/wayfinder/worktable-platform/implementation/11-acceptance.md)。首阶段工单已closed，完整spec仍open；未同步正式3080。

下文历史本地检查点路径不是办公室依赖；11个实施临时工作树已授权清理，保留分支、来源清单和本地发布归档。不要从历史段落推定原型、临时目录或旧命令仍可直接执行。

本目录是 AI 工作台框架的代码基线；原工作台 personal-workbench 继续保留，未将其前台带入本派生。

## 来源与保护

- 上游：https://github.com/Aisland-SJL/dsh-worktable.git，HEAD 0a9ff9d34eb2475b427bdfabe4321f53e27f9a2d。
- 基线是 2026-10-18 的本地 dirty 工作树，不是该 HEAD 的干净检出。
- UPSTREAM-SNAPSHOT.json 记录每个原文件的 SHA-256、大小和 Git 状态，包括未跟踪的会话、输入、传输与产物桥接修复。
- 原 README、MIT 许可证、模板、清单、锁文件和必要测试随派生保留。原编译产物在独立受保护检查点中按原字节保留；本目录的 lib 是可重新生成的输出，不作为源快照的替代。
- 完整检查点位于 my-dsh/.scratch/worktable-upstream-checkpoint-20261018；不要作为构建缓存清理。原 dsh-plugins/dsh-worktable 不修改。

## 身份与边界

首张基线工单保留包名、Cordis ID、ModuleLoader ID、API 路径及版本 dsh-worktable@0.4.0。尚未建立最终派生发行身份。只能在独立验收 profile 安装，不得覆盖正式 profile 中已有 dsh-worktable；不得同时在同一 profile 安装本基线和原插件。

上游声明宿主范围为 0.1.1-rc.2、0.1.2-rc.1、0.2.0-rc.2。0.2.1-alpha.2 不因当前框架研究而自动成为兼容版本；不使用版本豁免冒充通过。

## 构建和最终包

从 01_content 执行 npm ci --ignore-scripts --no-audit --no-fund，随后：

    node verify-upstream.mjs
    node tests/build-location.test.mjs
    node 01_content/release-prep.mjs

上述两条命令从本目录执行。构建输出已限定为脚本所在包的 lib，无关 cwd 不再污染调用目录。回归经过实际 build 命令红绿验证；不是检查源码字符串。

打包唯一入口仍是上游 release-prep.mjs：定向回归、构建、语法、精确七文件、独立 npm 安装与导入、客户端工厂求值、安装产物锚点与数据目录回归，以及双资产 SHA。禁止用裸 npm pack 替代发布准备。

独立 DSH 验收再使用未经修改的 rc.2 CLI 安装最终 tgz，并把实际安装文件与解包的七个文件逐项比较；浏览器验收由根 agent 执行，不以构建成功关单。

## 当前改动范围

除新增来源记录、构建位置回归和本说明外，基线只修复 build.mjs 的两个输出路径。项目、窗格、会话、标注以及原生页面适配保留本地上游实现。完整框架接入、协议与应用模型在后续工单实现。

本工单需根 agent 补实际宿主打开/关闭、空与已有会话、原生菜单、分栏缩放和刷新恢复证据。在此之前保持 open；不宣称完成 AI 任务、所有宿主版本或桌面闭环。

## 可复验门禁与未完成项

verify-upstream.mjs 将所有导入源码（含两份 MIT LICENSE、原 AGENTS.md、包清单和锁文件）与冻结清单逐字节比较；build.mjs 先还原已声明的两个 outfile 表达式再核对。完整 113 文件清单包含未导入的历史文档和原编译产物；它们保留在独立检查点。清单使用相对来源标识，物理位置只存于本地检查点记录。AGENTS.md 中要求 cd 后构建的旧约束针对上游原脚本；本派生用实际异目录构建回归验证修复。

2026-10-18 辅助门禁：异目录实际构建原实现失败、修复后通过；上游 release-prep 全部通过，最终七文件包经临时 npm 安装与导入验证。两份 0.4.0 tgz 的 SHA-256 均为 911020f17281cc7d13f9af7c8f1eab00f95fe2c2eb6316c63649eb8678fe021e。这些结果仅覆盖构建和发布准备，不代表官方 DSH CLI 安装或浏览器用户流程通过。源码提交排除 node_modules、lib、dist；重建产物不等于保护检查点。

依赖图：包内服务端与客户端由 esbuild 构建；开发锁定依赖以 package-lock.json 为准，宿主依赖及客户端注入由 package.json / dsh.plugin.json 声明。原生 DSH、会话/数据/凭据和正式 3080 不在派生源码变更范围。01 工单保持 open；真实官方安装逐文件核验及工作台打开、空/已有会话、项目切换、原生菜单、缩放、关闭与恢复仍由安装验收证据决定。
