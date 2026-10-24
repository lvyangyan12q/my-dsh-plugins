---
id: harness-rc3-legacy-role-contract
title: 公开角色历史接管与可信原生会话上下文合同
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-upgrade-kaogong-ownership, harness-rc3-public-contracts]
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

## Scope

本票只关闭 [HU05/HU08](../../worktable-platform/framework-spec.md#host-upgrade-requirements) 的公开角色合同与契约回归切片。用户已确认[历史学习私有接管、资料库显式共享](../issues/04-kaogong-ownership.md)。初始集成基线 `ed895b0`；原生只读基线 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` / rc.3。不关闭 Kaogong 接入、具体旧数据映射、最终包或真实原生验收。

## Public interface

新增协议特性 `legacy-role-adoption-v1`、`native-role-context-v1`；声明在发布 SDK 中。模块通过一个可信应用检查器隐藏角色文件、全局反向归属和耐久回执，不把任意原生上下文交给应用页面。

- Host `worktableRoles.contributeLegacy(appId, owner)`：仅有实际角色贡献的应用可注册唯一检查器；随应用销毁。`owner.inspect(sourceKey, {instanceId, roleId})` 必须只读，不运行旧插件的修复、迁移或会话创建。检查器返回稳定来源键和 revision、映射后的角色 ID、当前 Session/preset/cwd/phase、selectedPreset 及每条历史的独立 Session/preset/cwd；旧 Agent 有选择变化时由应用提供映射后的受控能力引用，预设仍必须是同一个原生 ID。
- 页面 `roles.previewAdoption(roleId, sourceKey)`：实例由 facade 固定；返回影响、阻塞项和包含源快照、目标、角色声明、实例 revision、原生校验事实的指纹。预览不写角色或原生 Session。来源、历史证据、能力映射或目录不明时显示阻塞，不能用当前 preset 填补旧历史。
- 页面 `roles.applyAdoption(roleId, sourceKey, fingerprint, true)`：只能选已注册来源，浏览器不能提交 Session 导入对象。确认后重新读取来源并校验指纹、原生身份、所有者代次及全局当前/历史唯一归属；只将完整单角色绑定原子写入。Host 迁移所有者也可通过同名公开方法显式传入 instanceId 执行同一合同。无 `create`、替换、改 cwd 或复制消息副作用。
- Host `roles.resolveSession(appId, sessionId, {access: 'read' | 'write'})`：仅供可信工具使用。ID 必须来自实际原生 `exec.agent.session.id`，不得取模型参数。当前 ready 角色校验后得到对应实例；历史校验独立身份，只能只读，write 准入直接拒绝。浏览器 HTTP、facade 均没有任意 Session 反向查询。返回的是已校验上下文事实，不代替资源授权检查。

未完成的旧 intent 保持 intent 和 selectedPreset，写入 `creationAttempt: started` 后只能明确恢复原 ID，不通过接管触发创建。缺失 ready 或任何缺少身份证据的历史阻止该项接管。应用需在只读预检时通过原生公开 stat/projections 得到历史身份事实；不能猜测旧 Agent 或改变目录使其匹配。

## Persistence and recovery

每个已接管绑定保留来源键/revision、源快照指纹、预览指纹及接管时角色 revision。相同预览重试或重启后重试返回同一回执，不重放创建；来源或绑定较新时停止。明确替换后保留原当前 Session 的独立历史元数据，旧接管不能覆盖新绑定。检查器撤销时拒绝未提交的接管，销毁等待在途操作。

首次明确接管将角色文件标为 schema 3；新实现仍读 schema 1，普通新角色不自动升级。旧 schema 1 Reader 对 schema 3 停止读写并保留文件，避免旧版本丢弃回执或历史元数据。此项会影响降级兼容：不能宣称回到旧包即可继续修改新角色库，不能倒灌旧整库掩盖新记录。与业务记录迁移分开，由最终回退验收核对。

接管以单角色为原子范围；应用迁移所有者要先预检全部角色，再记录逐角色回执及业务切换阶段。若中间失败，后续按同一指纹恢复，不能删除已完成回执或把业务整库回滚成旧状态。

## TDD evidence · 2026-10-24

预先确认的公开接缝：角色目录、受控应用贡献、公开原生 stat/projections/workspace、HTTP 准入、实例 facade 和文件持久化；没有新增私有 Lexical 或原生字段测试。

红灯：`contributeLegacy` 不存在；随后历史 write 模式未拒绝；facade 未提供预览方法；明确替换后缺少旧当前身份历史依据。分别以最小修复转绿。受限沙箱的真实锁/rename 失败与产品断言区分，获准后仅在测试临时目录执行真实文件操作。

组合命令从仓库根执行（依赖需正常安装）：

```powershell
node --test plugins/worktable/04_test/role-adoption.test.mjs plugins/worktable/04_test/role-adoption-http.test.mjs plugins/worktable/04_test/role-native.test.mjs plugins/worktable/04_test/role-panel.test.mjs plugins/worktable/04_test/roles.test.mjs plugins/worktable/04_test/role-lifecycle.test.mjs plugins/worktable/04_test/role-navigation.test.mjs plugins/worktable/04_test/sdk.test.mjs
```

40/40 通过、0 跳过，包含真实临时存储重开、文件故障恢复、来源变化、所有者撤销、历史 Agent 变化、跨实例归属、旧 schema 拒读保全、intent 不创建、较新绑定不回退、HTTP 认证拒绝、忽略浏览器伪造导入对象及 facade 固定实例。原生服务边界使用替身；不能将其称为真实模型/Session 通过。开发构建及 Host bundle 语法检查通过，未打包或覆盖冻结资产。

## Remaining installed acceptance

- [ ] 最终 SDK 归档安装及公开类型消费者检查。
- [ ] 合成旧角色来源在官方 rc.3 的实际 native 当前/冷/迁移待处理/目录别名与来源撤销流程。
- [ ] Kaogong 实际默认/科目角色映射、私有能力、历史学习分区及业务联合恢复。
- [ ] 具体正式迁移只读清单、影响预览和用户确认；本票没有读取正式旧记录或应用任何正式迁移。
- [ ] schema 3 的真实冻结包降级拒绝、恢复新包与新增数据保留。

原生 Harness、正式 profile、题库/资料、学习记录及冻结包未修改；完整 HU05/HU08 继续开放，真实验收由后续联合工单记录。
