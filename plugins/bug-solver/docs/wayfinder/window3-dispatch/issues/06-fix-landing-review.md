# 06 修复落点与审核语义

Type: grilling
Status: resolved
Blocked by: 05

## Question

- 修复落在哪：新分支 + commit、只改工作区不提交、还是别的？分支命名、基线分支怎么取。
- 审核会话的权限：只读评审（正确性 / 风险 / 测试建议），还是允许它改代码？
- 审核产物：review.md 的结构（结论、风险分级、必改项、建议测试）。
- 用户怎么批准合入：窗口3 记录「已审核 / 已合入」？还是完全手工 git？review 拒绝后怎么回到修复（新 run / 重开修复会话）？
- artifact 放哪：`<repo>/.bug-solver/runs/<bugId>/` 还是别的；gitignore 怎么处理。

## Answer

决策已并入 [窗口3 规格](../spec.md)：修复在新分支 `bugfix/<uid>-<runId>` 提交；审核会话 read-only；每轮先 `plan.md`、用户批准后再实现；审核 `request_changes` 自动进入下一轮方案；用户手工合入；产物在 `.bug-solver/runs/<runId>/round-N/`；审核 `review.md` 由桥从最终消息提取。
