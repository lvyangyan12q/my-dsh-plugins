---
id: worktable-platform-code-baseline
title: 以 Worktable 为代码基线，逐项迁入平台能力
parent: worktable-platform-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

## Question

后续采用 Worktable 还是现有 personal-workbench 作为代码基线？

## Resolution

用户在“以哪个为基线代码更好呢”的比较后回复“可以”，确认推荐路线：以本地 dsh-worktable 为新工作台代码基线，逐项迁入现有平台能力。保留 Worktable 项目、布局、窗格、标注、原生对话及产物挂载作为主体验；现有平台的数据、角色、能力复用、上下文及持久化为迁移候选，不一次性全部并入。

不覆盖当前两套代码，不继续建设重复窗口和搭建界面。精确上游提交、维护分支策略、可迁移契约、兼容目标与正式安装路径尚未决定。阅读统计为首个验证应用是助手建议，尚未由用户单独确认。
