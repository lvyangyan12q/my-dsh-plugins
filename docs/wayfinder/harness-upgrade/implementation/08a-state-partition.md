---
id: harness-rc3-kaogong-state-partition
title: 考公实例业务状态工厂与生命周期
parent: harness-rc3-kaogong-instances
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-upgrade-kaogong-ownership]
implementation_status: implemented
acceptance_status: contract-verified-not-installed
target: 0.2.1-rc.3
---

## 范围

这是 [08 考公实例接入](08-kaogong-instances.md) 的独立业务状态切片，不关闭 HU06/08 或实际应用隔离验收。依据已确认的[旧学习归属](../issues/04-kaogong-ownership.md)和[框架规格](../../worktable-platform/framework-spec.md#host-upgrade-requirements)，为新实例提供完整的六领域状态所有者，而不是让多个实例读取同一份旧 default。

本票只修改应用自己的 domain、课堂 schema/业务队列及新状态工厂。不接入 HTTP、工具、客户端、公共角色接管或资料库授权，不改宿主、原图/讲义/MinerU 目录、答案、评分算法和正式数据。旧全局描述符保留作兼容元数据；打开旧描述符并不是只读预检。现有 index 尚未迁入新工厂，完整应用仍须 08 接线，不能据本票声称旧全局路径已消失。

## 公开接缝

- `KaogongInstancePool(storageDomain, { readBinding? })` 是应用持有的模块。它接受 rc.3 公开的 DomainFacility.open；不读取平台私有状态。
- `acquire(instanceId)` 返回 `{ state, release() }`。同实例的并发视图/命令获得同一状态；不同实例使用确定性独立领域名。空身份和旧 literal default 拒绝，旧学习必须另行明确接管。
- state 提供 questions、planConfig、days、bankQuestions、knowledgeEntries、rounds、lessonRecords、lessonSelection，以及原 PracticeRounds/Lessons 业务接口。实例身份固定，课堂指针、记录及业务角色 key 属于本实例。
- `readBinding(instanceId, roleKey)` 只负责从所属应用的可信角色适配获得绑定；本模块不新建或发送原生会话。
- lease 必须覆盖完整业务操作，并在 finally 释放。最后一个 lease 关闭本实例；pool.close 拒绝新租用并等待现有租用释放，再清理所有自有领域。入口接线应先停止/排空请求，不持有 lease 等待 pool.close。

原生 KvTable/DomainGlobal 的 put/set 不重新校验 schema，校验位于持久化打开边界。因此新课堂写入面在持久化前另行校验本实例的记录和导航指针，拒绝写入其他实例的课堂；不依赖打开时校验来掩盖先写坏记录。

## 已实现

- [x] 六领域使用实例 SHA-256 命名空间，日期键、题目 ID、讲义 ID、计划和 activeLessonId 不跨实例碰撞。新实例不复制旧资料，也无默认资料库连接。
- [x] 课堂 schema 允许明确实例并要求业务 roleKey 的实例一致。Legacy default 的原记录仍可读；没有转换、修改或重写旧数据。
- [x] 新课堂创建/导航使用自己领域的实例身份；完成状态仍由原始实际作答证据及学习者确认决定。
- [x] 练习关闭后拒绝新命令；现有队列排空后关闭领域。单实例最后释放不会关闭其他实例。
- [x] 部分领域打开失败释放已获得领域，允许明确重试。关闭回执未知则保留失败的所有者，重复 release 仍报告失败，不静默新建替代；其他实例也会独立尝试清理。
- [x] 不自动执行 practice.recover、资料修复、MinerU 导入/轮询或旧 default 接管。

## 验证 · 2026-10-24

产品起点 `d908a4076e4a4b2b2059030983419b2e89270105`；实际未补丁原生 `0.2.1-rc.3` / `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，Node 25.2.0。使用实际公开 Cordis/JSON backend/DomainFacility 和独立临时文件，未启动 profile。

TDD 的可复现红绿路径：

1. 新工厂不存在时入口测试先红；初始跨实例相同键隔离转绿。
2. 课堂指针仍是 default 时明确失败；参数化领域/课堂所有者后转绿。追加负例暴露 native put 不校验，再加入写入守卫。
3. 最后关闭后旧练习命令仍执行时先红；增加队列关闭准入后转绿。
4. 关闭回执失败后能新开替代 owner 时先红；保留失败 entry/重复 release 结果后转绿。

六项新测试实际覆盖同实例复用、跨实例相同键、计划/指针/笔记/课堂角色归属、提交成绩及快照不被后来题库变更重评分、旧私有数据不被导入/分享、部分打开失败重试、独立关闭/重开与关闭未知。失效控制是外部 DomainFacility 的公开故障夹具，实际存储仍为官方 JSON backend。

从仓库根，将 nativeRoot/node 分别设为对应官方检出和 Node 绝对路径：

```powershell
$env:KAOGONG_TEST_RUNTIME = $nativeRoot
$env:TSX_TSCONFIG_PATH = Join-Path $nativeRoot 'tsconfig.json'
$loader = ([Uri](Join-Path $nativeRoot 'node_modules/tsx/dist/loader.mjs')).AbsoluteUri
& $node --import $loader --test plugins/kaogong/tests/instance-state.test.mjs
```

结果 6/6 通过，无跳过。宿主构建入口按现有 tsdown.host.config.ts 编译后，连同原 core/schema/practice-rounds/lessons 回归共 53/53 通过。测试会执行旧业务 apply 的场景也只使用其专用合成临时库，不读取正式 home。对新 instance-state.ts 的 strict TypeScript 无输出检查通过，解析到实际 rc.3 声明。

受限沙箱不能完成官方 JSON 后端的原子 rename，故存储测试在仅临时合成目录的受控提升环境执行。依赖只通过工作树根的 node_modules 临时 junction 指向已有产品依赖目录；没有安装或修改依赖目标。日志留本机，不入仓库。

## 后续验收与限制

完整客户端 typecheck 仍失败于现有 personal-workbench 导入和旧原生 slot；本票未改这些入口，也没有以局部类型通过冒充整个插件可构建。后续 07/08 必须移除旧运行依赖并复验。

- [ ] HTTP 使用已验证视图/实例，工具从真实 Session 绑定获得实例；新工厂不能代替入口授权。
- [ ] 浏览器草稿/偏好与多视图状态分区，角色 subject 到公开角色 ID 的稳定映射。
- [ ] 资料库类型、资源读取和撤销授权；本模块没有实现跨实例共享。
- [ ] 旧学习影响预览、稳定映射、具体确认和幂等迁移，保持原文件位置与原生身份。
- [ ] 最终归档和真实安装的两实例、多视图、教学/评分/统计/重启完整闭环。

本票只以已验证的状态模块合同关闭；父票和完整规格仍保持未完成。
