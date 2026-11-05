# 04 知识点主动回忆：源码与公开边界证据

日期：2026-11-05。基线 `43f05c5`（01/02/03 与 alpha.3 适配），工作分支 `codex/kaogong-recall04`。状态：implemented-pending-release-acceptance；准确发行包、真实浏览器视觉与完整闭环留 08，不据源码测试关闭父规格。

## 实现

- 新增档案隔离 `recalls` 领域，stable pointId、cycleId、确认历史与来源条目 referenceIds 与所揭示正文 SHA256 referenceEvidence；本人回忆和自评与客观练习评分分开。不存参考正文、不更改学习覆盖或正式计划。
- 手动确认入队首次 +1 天。先提交本人回忆，再明确揭示获准原文节选（数据没有标准要点字段），选择空初始自评后确认：未记住/模糊/记住按实际确认时间 +1/+3/+7 天；未记住也完成本次活动。
- owner 绑定 instance-state，全部写操作串行；重复入队/答复/同周期同自评确认不重复推进，冲突答复/自评或过期周期拒绝。提前提交须明确同意。
- 每次 Host 请求经过既有资料门禁，揭示与恢复重新读授权 facade。共享材料撤销返回既有 403；UI 清除旧参考正文、保留本人回忆及自评，重新授权/刷新后恢复原周期。空正文与无材料明确拒绝。当前原文与实际揭示指纹不一致时返回 409；恢复读取不自动揭示新版，必须点击重新查看参考原文。
- SDK 复习中心实际挂载主动回忆与既有错题面板；独立科目、知识点、到期/逾期/未来过滤与空队列；过滤按 profile+view 持久化，草稿按 profile+point+cycle 持久化。列表含回忆历史，资料图片使用 entryId 受控引用接口。
- 未新增 AI 自动确认工具、第二套判分、已学推断、隐式排程。06 可从 GET `/api/kaogong/recall` 读取 `items[].pointId/cycleId/dueAt/history[]`，历史提供 `cycleId/recall/rating/referenceIds/referenceEvidence/confirmedAt` 确认凭据。

## 已执行验证

环境：Windows，Node 25.2.0，DSH_SOURCE 指向官方已构建 `D:/programming/workspace/deepseek-harness` alpha.3；插件自有物理依赖，没有安装器穿越 junction，没有修改 Native 源码。

- `node scripts/test-current.mjs`：Host 57/57，client 35/35。
- `node scripts/test-current.mjs --domain`：21/21。
- `node scripts/build.mjs`：Host/client 构建及双官方声明生成通过。
- `node scripts/check-host-types.mjs` / `check-client-types.mjs`：通过。
- Host 新增 7 条：确认入队/档案隔离/覆盖不变；先回忆后揭示/无资料拒绝；三档实际时间间隔和冲突幂等；并发提交及确认/真实 JSON 重启；空正文拒绝；真实共享资料授权撤销与重授予；揭示后原文变更拒绝推进、重新揭示后确认且历史不复制正文。
- 页面新增 5 条：明确入队；fresh root 草稿与跨档案隔离；知识点筛选按视图恢复、空自评与本人确认；迟到旧 transport 命令不覆盖新 owner；完整输入→主动揭示→自评→确认与 403 清正文但保留本人草稿。真实 StudyDashboard 的复习导航另加入口断言，防止组件孤立通过但未挂载。
- TDD 的实际 red 包括缺少 route/动作、fresh root 草稿未读、无独立知识点筛选、空材料被允许、来源凭据缺失，以及 SDK 入口未挂载；均已修复为 green。测试参考材料为原创合成，真实业务数据和旧资料证明没有改写。

## 自审与限制

已核对真实挂载、队列写入序列化位于长寿命 owner、撤权的 Host 与页面结果、草稿白名单、显式自评、图片受控引用，以及没有改变客观正确率/已学/正式计划。手工 IME、浏览器视觉、准确包无工作台实装、模型 Native 全路径仍由 08 验收；未宣称通过。既有 Host 套件出现 React act 提示、构建器出现既有弃用提示，测试与声明退出状态均成功。
