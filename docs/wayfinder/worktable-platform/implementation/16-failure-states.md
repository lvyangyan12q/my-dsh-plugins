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
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。

## 2026-10-21 实现增量（待最终安装验收）

- 集中公开原生适配 `readHostTaskFacts` / `describeNativeTaskState`，TaskPanel 接入运行、待答、错误、未读、停止请求与未知文案；只读已持有会话，不激活冷会话。状态是原生会话事实，不伪装成某项业务任务的执行结论。
- rc.2 的公开 SessionStatus 仅提供 running / pendingInteraction / completionUnread，SessionSnapshot 另有 lastAgentError。没有确认取消的公开终态，因此 Stop 回执只显示“已提交停止请求”，不把 idle 或未读当成功/已取消。当前运行和待答优先于旧错误。
- 状态适配先观察 RED：20 过 / 1 失败（缺公开导出）；最小实现后相邻 7 个测试文件 44 过 / 0 失败 / 0 跳过。React TaskPanel 辅助测试验证用户可见文案，不算真实安装 UI。
- 独立合成 temp/profile 的真实 HTTP 请求遇到 Windows 文件句柄禁止替换，得到 503 / storage-unavailable，明确提示原记录保留；旧文件 SHA 和 GET 的实例保持。释放句柄后**同一 payload**重试 200，旧实例保留且仅新增一条。没有修改 ACL、真实业务 profile、原生源码或模型。现有持久化实现已满足此行为，无需为制造代码变更而改写它。
- [精确辅助证据](evidence/16-source-failures.json)。此条为源码检查点：当时尚待正式产物与真实状态验收；最终结果见下一节。

## 2026-10-21 实际观察（混合依赖环境，待纯依赖复验）

[16实际独立证据](evidence/16-installed.json)将源码辅助、实际Chrome原生用户流程、公开任务审计和root执行的正式安装profile存储短测分别列出。启动声明版本为未补丁官方0.2.0-rc.2，但root随后确认storage/webserver回退alpha.2且缺invariants peer；以下实际观察仅属当时混合解析环境，不能作为纯rc.2通过。Worktable0.8.0（SHA `c4fb81aa00de16390ed11eeadd7c0e0e5425bf48f0bfcbb156c4e066e8096a91`），Notes/Reading0.2.0；精确归档SHA均在JSON，未更换包或重启宿主。

两个新未归属合成实例分别拥有原生Session，prepare→显式confirm且无业务上下文。临时127.0.0.1 provider实际POST500及原生5/5重试后，原生Failed和TaskPanel原生错误同屏；随后provider、独占合成key及自建进程均清理，原DeepSeek/commandcode保留。第二Session只选现有commandcode模型，真实提问待答；切到自己的失败Session时模块保持待答，从模块Stop后显示停止请求及未读结束提示，打开正确原生Session后未读清除，原生轨迹实际ASK_ABORTED。运行中由保存的实际DOM证明，失败截图不假称运行中截图。

root在已安装3091平台文件上做真实Windows拒绝替换：HTTP503/storage-unavailable，旧hash及目录保持；释放句柄后同payload200恰好新增一个合成网页应用，实例/视图不增加，不改ACL、不发模型。它独立于此前temp mounted-route测试。

公开原生状态不提供确认取消或逐task业务结果，继续保留该上游限制；Stop、idle、未读不作为成功。原生空白会话选择器曾记忆本浏览器最近的临时模型，第二个新Session已显式选回commandcode，不声称浏览器近期选项毫无变化。截图仅保存C路径及hash，不提交二进制；完整framework spec、16及其他未完成工单保持open。


root发现原native alpha.2依赖回退后，本工单重新保持open，待独立公开依赖修复、冷启动和必要真实状态复验。此前“关闭”提交仅在子分支、未合入；本纠正明确撤销该结论，不删真实观察。此agent已无进行中任务或待答，专用provider/key/进程清理完毕，自建Chrome页关闭，可交root安全重启隔离实例。
