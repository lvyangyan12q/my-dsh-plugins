---
id: worktable-framework-16
title: 原生状态矩阵与存储失败恢复
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_failures
blocked_by: []
---

# 16: 原生状态矩阵与存储失败恢复

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

区分运行/待答/失败/取消/未读和未知，不能把running=false当成功。通过平台实际持久化接缝补实际文件系统拒绝写入、旧数据保持和恢复重试；用隔离合成记录，不更改用户业务文件ACL。集中原生适配，不修改Host源码。

## Acceptance

- [ ] 原生状态公开适配和实际任务控制；隔离安装profile平台数据目录真实存储失败→明确错误→恢复→重试，状态和旧记录保持。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。

## 2026-10-21 实现增量（待最终安装验收）

- 集中公开原生适配 `readHostTaskFacts` / `describeNativeTaskState`，TaskPanel 接入运行、待答、错误、未读、停止请求与未知文案；只读已持有会话，不激活冷会话。状态是原生会话事实，不伪装成某项业务任务的执行结论。
- rc.2 的公开 SessionStatus 仅提供 running / pendingInteraction / completionUnread，SessionSnapshot 另有 lastAgentError。没有确认取消的公开终态，因此 Stop 回执只显示“已提交停止请求”，不把 idle 或未读当成功/已取消。当前运行和待答优先于旧错误。
- 状态适配先观察 RED：20 过 / 1 失败（缺公开导出）；最小实现后相邻 7 个测试文件 44 过 / 0 失败 / 0 跳过。React TaskPanel 辅助测试验证用户可见文案，不算真实安装 UI。
- 独立合成 temp/profile 的真实 HTTP 请求遇到 Windows 文件句柄禁止替换，得到 503 / storage-unavailable，明确提示原记录保留；旧文件 SHA 和 GET 的实例保持。释放句柄后**同一 payload**重试 200，旧实例保留且仅新增一条。没有修改 ACL、真实业务 profile、原生源码或模型。现有持久化实现已满足此行为，无需为制造代码变更而改写它。
- [精确辅助证据](evidence/16-source-failures.json)。正式产物版本、安装与真实状态矩阵由最终验收追加；此工单仍为 open。
