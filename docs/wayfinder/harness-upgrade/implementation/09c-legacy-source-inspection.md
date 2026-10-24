---
id: harness-rc3-legacy-source-inspection
title: 无目标旧角色源检查与旧目录保留
parent: harness-rc3-legacy-adoption
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-native-history-identity]
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

本票仅实现 09/HU08 的通用公开角色接缝，起点 dbc5057；不关闭父票 09，不执行正式数据迁移、不读取正式旧库、不打包或修改原生 Harness。

Host worktableRoles.inspectLegacySource(appId, roleId, sourceKey) 通过已注册应用/角色所有者的可选 inspectSource(sourceKey, {roleId}) 回调，只读得到来源。它不需要目标实例，不创建实例/原生会话、不登记工作区、不移动目录、不修改角色或应用文件。原有 inspect(sourceKey, {instanceId, roleId}) 保持兼容；无 inspectSource 时拒绝无目标检查，不伪造 instanceId 或回退私有数据读取。浏览器 HTTP 和 RoleFacade 不提供此方法。

结果为 ready/blocked、稳定 fingerprint、blockers，以及经过公开 authority 校验的 source/native。使用 09b 的 stat/projections 补全历史身份；当前与历史保留各自真实 preset/cwd，工作区必须已公开登记并包含对应会话。缺失 ready 阻止检查；缺失 intent 保留 missing/未知结果，不启动创建。所有者撤销或角色贡献变化时拒绝在途结果。

fingerprint 覆盖规范化来源、角色声明和原生校验事实；来源 revision 或原生历史身份变化后改变。目标 previewAdoption 的 sourceFingerprint 与之相同，供可信业务计划核对；preview.fingerprint 仍是含目标状态的 apply 凭证。apply 重读所有者、来源与原生事实，保持幂等回执、实例排他归属和旧预览变化拒绝。持久化 adoption.sourceFingerprint 保持原有规范化来源摘要格式，兼容既有回执。

只有可信旧接管使用 source.creation.cwd 校验能力和原生身份，不要求它等于新角色默认目录。已接管角色的 read/ensure/open/resolveSession 和 intent retry 使用绑定保留的 cwd；明确 replace 和普通新建仍按当前角色声明校验目录。未登记的新默认目录不会使已接管的旧角色失效，也不能被普通 ensure/replace 绕过。

预先确认的测试接缝为 RoleDirectory 的 Host 检查、目标 preview/apply、read/ensure/open/retry/resolveSession 与实际 createRoleAuthority 的公开 stat/projections/workspace 替身。红灯：inspectLegacySource 不存在；最小实现后转绿。第二个红灯：旧 cwd 接管后 read 因新默认目录未登记而不可用；限定已接管绑定的目录选择修复后转绿。

```powershell
node --test plugins/worktable/04_test/role-source-inspection.test.mjs plugins/worktable/04_test/role-history-adoption.test.mjs plugins/worktable/04_test/role-native.test.mjs plugins/worktable/04_test/role-adoption.test.mjs plugins/worktable/04_test/role-adoption-http.test.mjs plugins/worktable/04_test/roles.test.mjs plugins/worktable/04_test/role-lifecycle.test.mjs
```

2026-10-24 组合 55/55 通过，0 跳过；新检查覆盖无实例的字节不变、稳定/变化指纹、跨目录接管与后续角色使用、intent 未知恢复、无隐式回调回退、所有者撤销、普通新建与明确替换目录限制；现有回归覆盖丢失回复/持久化故障、重启回执、排他归属与历史只读。官方原生服务使用公开接口替身，角色和应用文件使用真实临时目录；不等于安装后官方原生或正式旧数据验收。具体 Kaogong 计划、联合业务恢复、最终包和正式确认继续由父票处理。
