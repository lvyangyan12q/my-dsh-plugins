---
id: harness-rc3-kaogong-adoption-preflight
title: 考公接管前检查固定目标的原生会话所有权
parent: harness-rc3-legacy-adoption
status: in-progress
implementation_status: complete
acceptance_status: pending-new-archive-installed-run
assignee: kaogong-adoption-preflight
target: 0.2.1-rc.3
---

# 接管前置检查 · 2026-10-25

本票落实[09旧学习接管](09-legacy-adoption.md)及HU08既有要求。修复准备计划时漏查原生会话是否已经属于其他实例的问题；不改变旧学习归属、正式迁移确认或工作台已冻结版本的交付边界。

## 原因与行为

原三参数 `inspectLegacySource` 只检查来源及原生事实，不检查计划目标。考公据此返回可执行预览，执行时可能已创建隔离目标并导入业务，直到 `previewAdoption` 才发现会话已被其他角色占用。

- 公共Host接口增加可选的计划目标 `{instanceId}`。它只检查现有角色记录，不要求目标已经存在，不创建实例、视图、会话或绑定，也不写入来源。
- 检查当前与历史Session是否被其他角色拥有，以及来源是否已被其他实例接管；同目标、原接管回执及未改绑定仍允许恢复。原三参数纯来源检查保持原语义，浏览器与模型不能提交计划目标或原生身份。
- 纯计划先生成并固定历史目标UUID，再通过Host把该身份传给公开检查。阻塞原因沿用已有角色预览字段，不返回其他实例的标题、私有记录或历史正文。
- apply初始来源复验使用同一计划目标；即使在预览后会话才被其他角色占用，也在创建目标和导入业务前拒绝。角色接管前及最终来源复验继续使用同一目标，不跳过原生身份、来源版本、绑定修订或指纹检查。

本检查不是跨进程锁，也不承诺导入期间所有外部原生事实永不变化。中途失败仍保留原数据与隔离目标，按原回执显式核对恢复，不删除新记录或自动重试。此前unknown合成接管的部分导入继续隔离；本票未对其apply、recover或清理，也未执行任何正式迁移。

## 红绿验证

最高接缝仍是最终新包在真实DSH中的用户流程；以下是辅助生产Host及公开SDK回归，不作安装验收成功声明。

| 接缝 | 红色反馈 | 绿色结果 |
| --- | --- | --- |
| 已认证考公生产HTTP prepare | 已被其他应用角色拥有的Session仍返回`ready`；Host145项中144通过、1失败 | 返回`blocked`，具体角色阻塞为`session-owned`；确认apply被拒，实例、视图及角色文件保持 |
| 已认证考公生产HTTP apply | 预览后才占用Session，执行晚到`LEGACY_NATIVE_TARGET_BLOCKED` | 初始复验返回`LEGACY_NATIVE_SOURCE_CHANGED`，目标及业务导入未开始 |
| 公共来源/接管/历史/HTTP | 包括计划目标、普通当前及历史会话占用、同目标恢复、来源变化、owner撤销和旧schema拒绝 | 32/32通过、0跳过 |
| 考公现行Host回归 | 覆盖实际rc.3 JSON域、固定计划及未知回执恢复 | 146/146通过、0跳过 |
| 官方公开Host声明 | 固定未经补丁的rc.3源码及类型 | 严格类型检查通过 |

复现命令：设置 `DSH_SOURCE` 为固定官方rc.3检出后运行 `node plugins/kaogong/scripts/test-current.mjs --host`；平台定向入口为 `node --test plugins/worktable/04_test/role-source-inspection.test.mjs plugins/worktable/04_test/role-adoption.test.mjs plugins/worktable/04_test/role-adoption-http.test.mjs plugins/worktable/04_test/role-history-adoption.test.mjs`。首次普通沙箱执行平台临时文件测试遇存储权限错误；使用与Host检查一致的权限重跑后通过，未修改测试断言或跳过门禁。

## 发布与后续

Worktable `0.10.0-rc.3.3` 及考公 `0.2.0-rc.3.1` 冻结包未覆盖。本接口新增实现需要新的Worktable候选版本，新的考公包必须准确声明并验证该版本依赖，不能认为旧JavaScript服务会理解额外参数而安全兼容。新归档、实际安装、冲突来源实页及有效未归属老师接管仍待后续；09、HU08与考公完整交付不因源码回归关闭。
