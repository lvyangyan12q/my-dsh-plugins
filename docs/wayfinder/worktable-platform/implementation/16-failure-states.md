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
