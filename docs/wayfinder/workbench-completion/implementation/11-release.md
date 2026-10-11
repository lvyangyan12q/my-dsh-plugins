---
id: workbench-completion-release
title: 兼容、升级与回滚验收
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-runtime, workbench-completion-generation, workbench-completion-reading, workbench-completion-kaogong]
---

<!-- native-compatible-plan -->
## 当前执行范围（2026-10-11）

状态：open；等待无原生补丁适配及对应验收。

目标基线为未补丁原生639ed015；安装包只含插件，不含原生源码/lib补丁。验收依赖缺失、兼容入口、升级/回滚、卸载重装及数据保留；平台阶段与包含考公的完整阶段分开记录，不提前关闭本工单。

历史检查保留为旧环境证据，不作为当前基线通过。下列原始范围及验收项继续保留；涉及新增原生接口的实施方式以本节为准。


# 11: 兼容、升级与回滚验收

**What to build:** 维护者用发布包在不同依赖环境和升级/回滚流程实际使用完整平台，原数据、资料和会话保持。

**Blocked by:** 1 · 平台入口与窗口恢复；7 · AI 创建应用闭环；9 · 阅读统计通用应用闭环；10 · 考公学习完整闭环。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 30、32；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 完整用户流程分别通过无可选侧栏、兼容侧栏和停用适配器环境；未知/缺失依赖可操作恢复。
- [ ] 实际旧版本到当前归档升级、回滚、冷恢复、卸载重装保留数据、会话、能力归属和资料引用。
- [ ] 干净构建、全量回归、官方离线安装、字节、公开类型和原生客户端模块解析通过，不设置兼容豁免。
- [ ] 复核全部原规格及补充要求的逐项证据；部分、缺失、明确失败和条件阻塞不改写为完成。
- [ ] 正式数据与旧路径保持；桌面/窄屏、样式、焦点和物理输入法证据齐全，不能仅凭日志绿灯。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。


## 2026-10-11 用户确认：恢复原生、改为插件适配

验收基线改为未经工作台补丁的原生HEAD639ed015397290b3745d163aafe02ffee4aa3f84。此前native2ea补丁运行时上的406回归及实页结果只保留为历史证据，不能证明无补丁兼容。取消强制sidebar.sections、conversation.session.chrome、stageImages、retireTabsByKind及composer修改的安装/构建前提。后续在干净原生上重新构建、官方安装和完整平台闭环；缺失可选能力明确说明并保持入口/数据。不能用夹具新增这些服务来冒称兼容。

本工单保持open。详细原生改动清单见[恢复与后续适配](../native-restoration.md)。考公专项暂缓，已有数据与历史证据保留。

## 无补丁发布前置调整
发布构建移除四个原生补丁检查前置，默认回归移除补丁安装器夹具。保留独立官方runtime版本/CLI只读预检、公开类型编译、Client模块解析、安装字节及consumer验证；历史compat目录不再作为安装指南。rc.2无补丁验证和用户当前alpha.2的正式兼容是分别的证据，不能混用。



### 已安装公开类型验证修复
独立未补丁639首次官方安装consumer编译报TS6200：Schemastery从旧原生目录与选定runtime各加载一份全局声明。类型验证工具现把Schemastery与其他原生公开声明统一锚定选定runtime，不再从profile工具依赖取另一份。对同一已安装归档复验先失败后通过，保留strict及skipLibCheck=false；不更改产品归档、原生源码或编译产物。完整发布流程及Browser仍需单独复验。


### 原生版本候选矩阵
版本预检只允许0.2.0-rc.2与0.2.1-alpha.2；三个产品native声明仅列这两个精确版本。所有First-party类型锚点及运行时版本必须严格等于选定runtime，不能以另一个候选版本混用。新增alpha候选只解锁实际编译/安装验收入口，不代表通过；alpha真实全量检查及Browser证据仍待根代理回填。其他版本明确拒绝，无兼容豁免。

