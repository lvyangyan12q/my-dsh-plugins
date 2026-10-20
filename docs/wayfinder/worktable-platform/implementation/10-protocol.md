---
id: worktable-framework-10
title: 第二应用独立接入并冻结首版协议
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: second_application
blocked_by: [worktable-framework-08]
---

# 10: 第二应用独立接入并冻结首版协议

**What to build:** 另一个真实开发应用依据接入文档通过注册接入，主要增加应用自身代码，不修改工作台核心私有分支。

**Blocked by:** [持久化、并发与冷恢复](08-recovery.md)。

**Status:** closed

- [x] 另一个真实开发应用依据接入文档通过注册接入，主要增加应用自身代码，不修改工作台核心私有分支。
- [x] 验证完整页面和模块、实例上下文、数据源及需要时的角色任务可以按声明复用。
- [x] 公开最小注册/生命周期/状态/数据/任务契约，集中DSH适配；说明轻量网页与深度接入能力差异。
- [x] 协议、应用、配置schema和业务数据版本分别处理，未知版本/缺能力明确反馈，注销及释放行为可复验。
- [x] 依据两个真实应用的结果冻结第一版接口并记录兼容策略，提供开发者接入和反例说明；不假设高级网页桥接已交付。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## Prepared candidate（历史检查点）

Project Notes与公开SDK候选实现见[10接入合同](10-sdk-contract.md)。已合入09最终生命周期实现；产品Worktable0.6.0首次发布SDK子路径，Notes要求>=0.6.0。源码/包门禁仅辅助，真实双应用、公共与应用私有Skill加载、跨实例/冷恢复待root最终安装验收；本工单保持in-progress，未勾选真实结果。

## 2026-10-20 最终真实双应用验收与独立复审（关闭10）

精确实现 `4e7df6f830b7096f2a8a41738ccd17b30900278a` 经独立复审、root真实验收及精确批准保护快进合入。Worktable0.6.0双资产 SHA256 `bb645b7cc3afd3e9919ab5f0ee570ea04296c2fe4b4294bbc4e5032f79aa8aa9`，Notes0.1.1双资产 `adb9271b63828a8614efb6d44435564dc5d7b0f9bc3390a9e6e6a50cc66abe0d`，官方CLI安装隔离3091核对9/5文件；Reading沿用08精确归档。[真实验收记录](evidence/10-installed.json)保留旧Notes0.1.0配置入口缺失、最终修复与实际通过范围。

两个项目的Notes独立实例实际完成新增、修改、归档与恢复，page/summary同步筛选和选择；第二实例初始为空且筛选独立。同一项目Reading、网页和Notes共存。原生Plugins→Project Notes→project-notes行配置页显式保存公共Agent、公共Skill、Workspace三字段，未创建Session或任务、业务hash不变；冷重启后配置保留，无手改YAML或原生源码。

N1显式准备不发送，用户明确提交后只有1条原生输入；真实轨迹分别调用应用私有project-notes-format（provider project-notes）与公共text-organize（provider worktable-managed），只整理所选便签，业务hash不变。N2打开独立空原生Session保持0输入，不沿用N1历史。冷重启后业务hash、实例/角色绑定/任务及原生1/0计数保持，无自动重放。官方Notes开关撤销贡献时仍可从持久交接打开原Skill历史，复启不删业务、不新建会话。Reading4条/108分钟及原生10输入保持。

独立审查覆盖最终源与安装包、SDK正负类型、owner/授权/任务接缝、撤销UI清除及配置真实官方服务合成流程；两项P2修复有公开RED→GREEN。作者Worktable172项、Notes最终14项零skip；锁瞬态修复范围与200轮辅助竞争证据见合同，不当作真实profile故障注入。

首版公开SDK v1依照Reading及Project Notes实际接入冻结，限本合同声明的注册/实例视图/资料owner引用/私有能力/角色/准备任务/生命周期，不承诺通用Stats组件库、任意业务schema适配或高级网页原生桥接。额外Notes N1→N2共享操作在任何变更前被自动审核拒绝，具体用户授权仍待提供，未创建grant、未声称Notes共享验收通过；05的Reading共享/撤销主验收已通过，该额外案例可在11获许可后补验，不替代自主owner-source接入证据。

本次仅关闭10。完整framework spec仍OPEN；11须修复两项原生全局菜单/项目导航缺陷，完成最终UI与独立Standards/Spec两轴审查（用户固定基线 `485b38cfd9a5d10de5a668ea4864246d4b1ebea7`）。无原生卸载veto或自动原生pending恢复承诺；进程重启为精确拥有PID终止，非正常排空退出。六个历史脏文件、index及native/upstream由guard保护，正式3080和远端未改。
