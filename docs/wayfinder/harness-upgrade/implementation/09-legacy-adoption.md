---
id: harness-rc3-legacy-adoption
title: 旧学习与角色的只读预检及幂等接管
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [harness-rc3-legacy-role-contract, harness-rc3-kaogong-instances]
target: 0.2.1-rc.3
---

实现 HU08：独立只读清单和稳定映射将旧 default 接管到一个历史学习实例，将可证明的来源资源映射到资料库实例。提供具体影响预览；正式 apply 必须由用户确认具体计划，不能以原则确认代替。

- [ ] 预检不启动旧考公 apply、practice.recover、材料修复或 MinerU 轮询，不改旧库及角色记录。
- [ ] 保留当前/历史 Session、preset、selectedPreset、cwd、角色 subject 及未定结果；不重建老师、不复制消息。
- [ ] 知识条目归属不明时留私有；文件原址引用，哈希与数量差异可核对，不改答案、不重新评分。
- [ ] 计划固定旧数据版本与 revision；变更后拒绝旧计划，幂等回执能处理执行失败、丢失回复和重启。
- [ ] 恢复不覆盖升级后新增数据；版本、配置与业务迁移分别说明回退前提。
- [ ] 在合成的旧格式数据先验证，正式预览准备到可审阅后再请求最终确认。
