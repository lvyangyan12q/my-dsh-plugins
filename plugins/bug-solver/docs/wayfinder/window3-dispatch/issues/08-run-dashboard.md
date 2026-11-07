# 08 运行看板与产物

Type: prototype
Status: resolved
Blocked by: 01, 05

## Question

窗口3 在确认页之后显示什么：

- 运行列表：进行中 / 待审核 / 已结束；每个 run 的阶段（已确认 → 修复中 → 待审核 → 审核中 → 待合入 → 已结束）。
- 实时状态：怎么读到（轮询桥接口 / 事件 / artifact 文件）；刷新节奏；失败与「需要你回复」怎么突出。
- 产物：diagnosis、fix、diff、review 的展示与下载；会话入口（打开主会话/审核会话）。
- 空态、错误态、超时、取消。
- 用 dshell 原生组件（卡片/徽标/进度/列表/标签页），避免自造样式。

先用静态假数据做可点原型，确认信息层级后再接真数据。

## Answer

决策已并入 [窗口3 规格](../spec.md)：UI 方向 **B 轮次时间线**；`任务 / 对话（只读）` 页签；阶段/轮次/产物/`needs_attention`/Stop/通过/去复盘；活跃轮询 1.5s、空闲 10s。原型见 `prototype-window3-ui.html`，截图见 `preview/proto-window3-*`；A/C 仅留档。
