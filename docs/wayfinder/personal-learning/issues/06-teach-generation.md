# 06: /teach 生成适配

**What to build:** 让 `/teach` 生成课程时产出符合协议 v1 的交互课；不符合协议的产物被明确拒绝并说明缺什么，生成失败或取消时保留原来的课。

**Blocked by:** 03 课程协议 v1 与参数桥

**Status:** complete

- [x] 教学技能输出的课程包含协议：参数、读数、预测、复述四部分，且能通过宿主校验。
- [x] 模型提交不合规课程时，拒绝原因可操作（缺哪个部分、哪个字段越界），并且不覆盖已存在的课。
- [x] 生成中、失败、取消、完成四种状态在界面上可区分；失败或取消后旧课仍可学习。
- [x] 同一请求重试不会重复收录课程：同一 requestId 的二次提交被拒绝，撤回后的重试只准备一次草稿。
- [x] 至少一次真实模型生成产出可进入实验台的课程；替身样本只用于自动化。

## Evidence

真实模型 `zai-coding-cn / glm-5.3-flash` 在隔离宿主上生成《条件概率：把范围缩小到 B》v1：
lab 协议通过宿主校验，课程 HTML 同时监听 `personal-learning:parameters` 与 `personal-learning:lock`，
在真实 UI 中预测前锁罩与 `?`、预测后 30%/75% 与选项反馈均正确。回执见
`evidence/real-generation-receipt.json`，截图 `accept-generated*.png`。
