---
id: harness-rc3-native-session
parent: worktable-ai-framework-spec
title: rc.3 原生角色会话公开校验与创建恢复
labels: [ready-for-agent]
status: in-progress
assignee: null
blocked_by: []
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

# rc.3 原生角色会话公开校验与创建恢复

本票是 [HU02](../../worktable-platform/framework-spec.md#host-upgrade-requirements) 的独立适配切片。用户要求按 implement-spec 实施；本切片不决定考公历史学习的归属，不执行正式迁移，不关闭 HU02 或整个规格。固定实现基线 a81ac773fd2599744085ffd098cc32d3f4418e2c；目标宿主官方 0.2.1-rc.3 / 22ddee3792402c3e70ec5f86a63c3e3e895a2f60。

## 行为与边界

- 使用公开 sessionPersistence.stat 的 header.id/cwd/formatStatus 和 sessionController.projections 的 sequenced 值验证身份、Agent、目录及原生工作区成员关系；不读取完整会话日志，不调用已移除的 inspect，不自动迁移或重建会话。
- 目录的字符串规范化相同则接受；不同别名必须在文件系统 realpath 核验为同一目录。保留原 Session header.cwd。
- 新建前检查预留 ID 冲突；返回其他 ID 或 Agent 拒绝绑定，不重发、不删除原生已产生的副作用。
- RoleDirectory 在调用原生 create 前先持久化 creationAttempt=started。缺失回执、flush 失败、就绪状态保存失败后，显式重试仅通过 recoverCreation 核验原预留 ID 并 flush，绝不再次 create。原 ID 缺失时报告 creation-unknown；用户可核对原生会话，恢复记录或显式替换。明确替换仍保留旧 ID 到历史。
- 旧 ready 绑定保持原校验；旧 intent 没有 attempt 字段时保守按结果未知处理，不能推断从未调用 create。字段为向后可读的可选附加记录，未转换正式数据。

## 已执行验证（2026-10-24）

预先确认的公共角色/原生适配接缝：RoleDirectory、createRoleAuthority 及公开 Host 服务契约。夹具只实现公开服务；不读取正式 home，不启动或停止用户实例。

TDD 红绿证据：移除夹具 inspect 后先复现 TypeError；migration-required 且缓存 Agent 陈旧时先复现 agent-changed 误判；添加恢复方法前先复现 recoverCreation 缺失；持久化未知创建测试先复现无 receipt。各切片随后转绿。

最终命令（仓库根）：

```powershell
$env:NODE_PATH='D:/programming/workspace/my-dsh/plugins/worktable/01_content/node_modules'
node --test plugins/worktable/04_test/role-lifecycle.test.mjs plugins/worktable/04_test/role-native.test.mjs plugins/worktable/04_test/role-navigation.test.mjs plugins/worktable/04_test/role-panel.test.mjs plugins/worktable/04_test/roles.test.mjs
```

结果 30/30 通过。包括真实临时文件写入/重开、保存失败、并发绑定、跨实例历史反向归属、未知创建重启、无 receipt 的旧 intent、真实目录 junction、缺失/迁移/Agent/cwd/成员冲突、返回其他 ID 与丢失回执。NODE_PATH 仅复用现有 esbuild 测试依赖；不写依赖链接或配置。首次宽测因未装 esbuild 失败，配置进程级 NODE_PATH 后通过。受限沙箱的临时文件原子写入失败，使用仅测试临时目录的提升执行后通过。

## 尚未验收

- [ ] 新版本最终包安装到隔离 rc.3，实际创建、打开、恢复和刷新角色绑定。
- [ ] 真实宿主已有/冷/待迁移会话与目录别名的完整身份保护。
- [ ] 真实不确定创建、重启后恢复和显式替换的用户操作。
- [ ] 正式发布门禁、资料保全、原生 AI 执行及最终切换。

以上不能由这 30 项回归替代。本票保留 in-progress，等待集成分支的安装验收；不更改宿主、SDK 接管合同、Kaogong 业务记录、版本或冻结发布包。
