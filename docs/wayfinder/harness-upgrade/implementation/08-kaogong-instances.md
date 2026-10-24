---
id: harness-rc3-kaogong-instances
title: 考公六领域实例隔离和受控资料库
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [harness-upgrade-kaogong-ownership, harness-rc3-legacy-role-contract, harness-rc3-kaogong-state-partition]
target: 0.2.1-rc.3
---

实现 HU05/06：考公独立通过 Worktable SDK 注册，去除 personal-workbench 运行依赖。私有角色/Skills 归应用所有；新学习实例为空，同实例多视图共享状态，不同实例默认隔离。历史学习与资料库的归属按已确认决策，正式接管由09另行处理。

- [ ] notebook/progress/bank/knowledge/practice/lessons 六领域均有明确 owner；activeLesson、日期键、默认计划及浏览器草稿不跨实例串用。
- [ ] HTTP 请求验证视图/实例归属；原生工具从可信 Session 绑定确定实例，拒绝模型伪造 instanceId 或全局回退。
- [ ] 原始来源与私人笔记分开；资料库读授权显式且可撤销，新实例无默认全库访问。
- [ ] 评分、题目快照、答案、提交顺序与课堂完成规则保持，未提交练习不泄露评分答案。
- [ ] 保留原图片/讲义/MinerU 路径与引用，不自动复制或移动资料，不在只读预检启动 recover/修复/轮询。
- [ ] 用实际两个学习实例和同实例多视图复验 HTTP、工具、草稿、统计与撤销；边界测试只是辅助。


08a-state-partition为可独立实施的业务状态切片，先验证六领域所有者及课堂/练习实例化；本票仍负责HTTP、可信工具上下文、浏览器状态与实际SDK接线，不能由08a替代整体验收。
