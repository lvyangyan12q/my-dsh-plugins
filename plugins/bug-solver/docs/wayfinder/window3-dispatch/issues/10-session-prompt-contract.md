# 10 会话提示词契约

Type: grilling
Status: resolved
Blocked by: 05, 07

## Question

两个会话的 prompt 怎么组织，才能稳定、可审计、可重跑：

- 分析修复 prompt：角色、输入上下文（bug、SSH、仓库、约束、artifact 路径）、步骤（只读诊断 → 代码定位 → 修复 → 自测 → 写产物 → 汇报）、禁止项、完成标记。
- 审核 prompt：读哪些 artifact / diff，输出 review.md 的结构，是否允许改代码，结论怎么给。
- 上下文 JSON 的字段与大小上限；bug 描述里的密码怎么在进 prompt 前脱敏。
- 是否要求 agent 用固定 JSON schema 汇报；失败/被拒绝时怎么写。
- 会话标题、workspace、模型/权限（不锁默认值，但要有可配入口）。

## Answer

决策已并入 [窗口3 规格](../spec.md)：修复会话每轮先 plan、等窗口3 批准后再 implement（同一会话）；审核会话输出固定 JSON `verdict`；`specRef`、分支/base、artifacts 路径进 prompt；每轮确定性 requestId；`needs_attention` 不自动跳；不设固定超时/模型/轮次默认值。
