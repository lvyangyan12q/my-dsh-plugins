---
id: harness-rc3-native-history-identity
title: 平台公开原生历史身份补全
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-legacy-role-contract]
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

本票仅实现 HU08 的历史原生身份补全切片；父票 09 与正式接管继续开放。集成起点 bc40291；官方原生只读参考 22ddee / 0.2.1-rc.3。没有读取正式旧库、原生消息或私有缓存，没有执行正式 apply、创建、发送或修改原生会话。

可信 LegacyRoleOwner 可以返回 previousSessionIds，或继续提供完整 previousSessions。两者并存时必须一致；重复历史 ID、当前 ID 重复进入历史以及不明来源均拒绝。页面仍只能选择应用注册的 sourceKey，不能导入任意身份对象。

平台 createRoleAuthority 使用官方 sessionPersistence.stat 和 sessionController.projections 获取每条历史实际 preset 与 cwd，并核对唯一原生 workspace membership；缺失、迁移待处理、格式未知、缺少身份字段、工作区冲突均阻止接管。历史可以拥有与当前不同的 preset 和目录，不使用当前角色声明补齐历史。完整旧快照仍经原有公开校验；显式声明与补全事实冲突时拒绝。

补全发生在源与预览指纹计算之前；apply 重读来源与原生事实，变化或缺失时拒绝旧预览。持久化继续保存独立历史身份，保留 phase、selectedPreset、来源版本与回执；应用实例和角色的全局唯一归属规则不变。历史工具上下文继续只读。

预先确认的测试接缝为 RoleDirectory previewAdoption/applyAdoption/resolveSession 与 createRoleAuthority 的公开 stat/projections/workspace 适配。红灯：原始 ID 来源预览被拒绝；最小实现后通过。第二次红灯：完整历史空列表与非空原始 ID 同时出现未拒绝；一致性校验修复后通过。

从仓库根执行：

```powershell
node --test plugins/worktable/04_test/role-history-adoption.test.mjs plugins/worktable/04_test/role-native.test.mjs plugins/worktable/04_test/role-adoption.test.mjs plugins/worktable/04_test/role-adoption-http.test.mjs
```

2026-10-24 上述组合 38/38 通过，0 跳过。受控原生服务替身及真实临时角色文件测试覆盖：历史独立 preset/cwd、缺失、迁移、不明事实、工作区冲突、重复身份、预览至 apply 变化、跨实例归属、完整旧快照兼容、浏览器伪造输入拒绝与原有 intent/owner/recovery 回归。替身通过不等于官方已安装原生会话验收；最终包、具体 Kaogong 接管计划、联合业务迁移、正式确认及回退仍由后续工单处理。
