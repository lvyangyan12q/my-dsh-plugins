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

## 已合入的只读准备切片

[09a 旧学习只读清单](09a-legacy-inspection.md)已合入，提供独立离线私有快照和脱敏摘要。它不生成可执行迁移计划，不验证原生历史身份，也不实现 apply、稳定映射、幂等回执或回滚；父票仍为 open。后续具体计划须消费此清单并重新核对源 revision，再请求用户确认。

[09b 原生历史身份](09b-native-history-identity.md)与[09c 无目标来源检查](09c-legacy-source-inspection.md)已合入通用平台接缝：经公开原生事实补全各条历史身份，并允许可信Host在不创建目标实例时只读检查来源；接管后保留原目录。两票仅关闭其契约回归范围，尚待最终安装验收。它们不建立Kaogong具体计划、不应用业务迁移，也不关闭本票。


[09e 固定计划与回执](09e-adoption-workflow.md)提供正在实现的纯计划、Host-only 稳定目标、显式确认执行和未知恢复；正式接管与材料/原生闭环尚未完成，父票保持 open。
