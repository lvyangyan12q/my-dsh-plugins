---
id: worktable-framework-07
title: 数据上下文与原生AI执行闭环
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: native_execution
blocked_by: [worktable-framework-05, worktable-framework-06]
---

# 07: 数据上下文与原生AI执行闭环

**What to build:** 准备任务展示准确的实例、角色、来源视图及选中记录/筛选上下文；可编辑、移除上下文和放弃。

**Blocked by:** [实例授权、数据联动与显式共享](05-data-grants.md)、[角色会话隔离与能力复用](06-roles.md)。

**Status:** closed

- [x] 准备任务展示准确的实例、角色、来源视图及选中记录/筛选上下文；可编辑、移除上下文和放弃。
- [x] 准备、打开及恢复不调用模型，显式发送才发起原生任务，失败不换通道重复发送。
- [x] 实际模型回复与工具执行可在正确原生会话中查看，原生问题、审批、轨迹和Stop真实可操作。
- [x] 隐藏/关闭视图不误停任务，运行/待处理/取消/失败/未读分别反馈，不把结束信号当业务成功。
- [x] 同会话多视图采用清楚输入所有权，跨实例草稿保持隔离；原生能力缺口明确反馈并保留既定阶段替代路径。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## 2026-10-19 实现与最终产物（真实闭环已验）

新增[07执行协议](07-execution-protocol.md)：模块内准备/编辑移除/放弃、单一认证Host提交、固定角色与来源、05资源及06绑定紧前复验、短Owner准入租约、耐久requestId和unknown不重放、历史Session原生导航/Stop。阅读仅薄接自有记录及筛选上下文，没有加载旧个人工作台前台。

[源码与最终包辅助证据](evidence/07-source-package.json)记录工作台153/153（0跳过）、独立安装与7文件、工厂/导航/DOM8/home3门禁；阅读官方Domain与React6/6，独立消费者安装、6文件逐一比对及导入。阅读类型检查复用原check-types.mjs环境映射，明确借用main未改动的旧适配器声明，不能当成从零旧前台类型生成。最终运行包安装与导入不依赖该映射。

工作台双包SHA-256：`b9f47f830df519bcd71b5681bac0aef87d6f996949916baa1cf117f074e6b61e`。阅读双包SHA-256：`9b8fb5c43c5b16d8988349f72d2efb77ad33136d8985f8ade6a4212ff985959f`。独立复审的可复现问题已纳入永久回归：未知意图Stop、共Owner多资料自等、晚到回执Stop审计、ALS过期/原生后代特权隔离、任务/角色/资料三HTTP路由中文跨网络块解码。

153项包含受控原生适配器测试，不是153项真实模型流程。root已在隔离3091用最终双包完成真实验收：[安装与实页证据](evidence/07-installed.json)、[原生轨迹截图](evidence/worktable-07-native-trajectory.jpg)。实际Skill和文件读写、原生问题回答与续行、待处理时Stop、文件审批拒绝及allow-once、发送前撤销拒绝、关闭来源视图后同实例恢复、刷新后待处理回答及跨实例草稿均通过；六次显式发送对应六条原生用户输入和六轮，无重放。Stop只针对该原生会话当前回合，保留队列且不回滚写入；accepted不等于业务成功。

独立复审后，按root对精确候选 `93656beccc2e5f8924ff3fec25da194eee719ba2` 的批准，保护guard快进合入集成分支，保留6个历史改动及原生/upstream状态。07关闭；08由root另行领取，完整冷恢复不作为本工单新增验收结论。未同步正式3080或远端。
