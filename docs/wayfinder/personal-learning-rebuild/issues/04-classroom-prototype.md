---
id: personal-learning-rebuild-classroom-prototype
title: 四区课堂与知识脉络的交互原型评审
parent: personal-learning-rebuild-map
labels: [wayfinder:prototype]
status: closed
assignee: null
blocked_by: [personal-learning-rebuild-host-contracts, personal-learning-rebuild-file-ownership, personal-learning-rebuild-session-context]
---

# 四区课堂与知识脉络的交互原型评审

## Question

在已确认的课程目录、讲义/动态实验、Markdown 个人笔记和内嵌会话结构中，什么宽度、收起与恢复、选文批注、上下文提示和 Canvas 切换方式最顺手？通过 OpenDesign Cloud 或 Local Codex 制作一次性原型，评审正常学习、空课程、生成中/失败和窄窗格，不把模拟会话作为宿主能力证据。用户实际评审之后才能关闭。

## Resolution

### 历史记录：2026-11-09

当时由助手以对话确认替代独立原型关闭本票。该关闭不代表用户已完成原型评审，以下历史不能作为原型验收依据。

- 用户在对话中逐轮确认：目录 / 讲义与动态实验 / 笔记 / 对话四区；三栏可收起；分隔条可拖拽；窄屏改为切换而不是横向滚动；讲义为主内容；不新增第五栏。
- 布局与交互规则写入[学习课堂规格](../spec.md)的「课堂界面」与「笔记编辑与批注」。
- 未产出 OpenDesign 原型；没有浏览器或视觉评审证据，**不宣称体验已验证**。
- 当时写明后续补浏览器验收；不能因此免除用户明确要求的原型评审。

### 本轮结论：2026-11-10

用户要求通过 OpenDesign MCP 先生成再确认。Local Codex 已完成三方案可切换的 HTML 交互原型；用户明确选择 **B 阅读优先**，并指出 A/B 差异不明显。此时本票才具备真实的人类选择依据。

- 布局方向：窄目录、宽主内容、笔记和老师保留并排与各自收起能力，拖拽调整；Canvas 只替换主内容。
- 仅确认整体方向，所有按钮细节、真实 Session、文件存储、权限、Stop 与审批尚未由原型证明。原型模拟不进入生产。
- 产物身份：项目 `dsh-fbde`，HTML 入口；[用户评审的 B 预览](http://127.0.0.1:7329/api/projects/dsh-fbde/raw/index.html?variant=B)为当前本机运行时链接。
- 选择已纳入[学习课堂修订规格](../spec.md)。本票 closed 表示布局方向确定，不表示完整交付验收完成。
