# 02 窗口1 派发：点「处理」之后

Type: grilling
Status: resolved
Blocked by: —

## Question

窗口1 的「处理」现在只展开信息面板并复制文本。改成派发后要定：

- 点「处理」是直接派发到窗口3，还是先开详情、详情里再点「派发」？是否保留复制/详情入口？
- 窗口1 → 窗口3 的通道：`BroadcastChannel` + `localStorage` 草稿 + `data/dispatch/queue.json` 三件套怎么分工？
- 窗口3 没开、被刷新、或切到别的项目时，请求怎么不丢？重复点击怎么幂等？
- 窗口1 在派发后显示什么（已发送 / 等待确认 / 失败）？

## Answer

决策已并入 [窗口3 规格](../spec.md)：窗口1「处理」=直接派发到窗口3，标题仍开详情；派发写 `localStorage` 草稿 + `BroadcastChannel` 通知 + 队列文件；按 bugId 幂等；反馈已发送/等待确认/失败。未做：正式页实现。
