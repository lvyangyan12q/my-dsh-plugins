---
id: worktable-framework-09
title: 停用、升级与回退的数据保护
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: lifecycle
blocked_by: [worktable-framework-08]
followup_target: 0.2.1-rc.3
followup_status: pending-decisions
followup_blocked_by: [harness-upgrade-support-policy, harness-upgrade-acceptance-cutover]
---

# 09: 停用、升级与回退的数据保护

## 2026-10-24 rc.3 增量（尚未实施/复验）

原 status: closed 和原勾选仅对应历史宿主及已记录范围，继续保留；本节不是该历史阶段重新通过的证明。当前 followup_status 为 pending-decisions，依赖[升级决策](../../harness-upgrade/map.md)；不能仅凭旧 ready-for-agent 标签或原依赖已关闭领取新宿主增量。完整增量依据为[框架规格 HU04、HU08](../framework-spec.md#host-upgrade-requirements)。

- [ ] 补齐自身旧 HTTP/Upgrade 路由和监听释放；实际停用、热替换、卸载重装不残留重复注册。
- [ ] 视图关闭或应用停用不误停任务、不丢失原生控制、不删除业务数据或会话。
- [ ] 验证新包与冻结回退包/宿主/数据格式的匹配边界，保留迁移后新增记录。

## 原阶段要求与证据

**What to build:** 停用阻止新实例与新任务，不自动停止已有任务；仍可在原生会话查看、审批和Stop。

**Blocked by:** [持久化、并发与冷恢复](08-recovery.md)。

**Status:** closed

- [x] 停用阻止新实例与新任务，不自动停止已有任务；仍可在原生会话查看、审批和Stop。
- [x] 卸载前明确处理运行任务；在控制交接未完成时不销毁必要控制入口，不能将任务变成无人可管。
- [x] 可验证可回退配置升级可自动执行；不可逆业务迁移先说明影响并确认，不兼容时停止并保留原数据。
- [x] 实际安装旧/新产品升级、失败及回退可复验；回退不倒灌旧整库，也不承诺撤销不可逆业务修改。
- [x] 停用、卸载和重装不默删资料、成绩、记录、授权元数据或原生会话；复核原生和上游保护清单。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## Implementation checkpoint（历史：当时待真实安装验收）

候选产品 0.5.0 已实现 [09 生命周期契约](../09-lifecycle-protocol.md)：持久开关、原生历史交接及可逆 schema1/2 回退门禁。源码/最终包辅助检查不替代官方插件管理真实停用、卸载、升级、失败和回退；当前保持 in-progress，不勾选验收项。Reading 包无改动，沿用08精确归档。

辅助检查：Worktable 0.5.0 `npm run pack` 170/170、零 skip，最终 7 文件安装/导入、工厂、保留布局导航、DOM8、目录3通过；双资产 SHA256 `896c81bbc6526355889c07ef79137f31595a92c67250b0221e7353ff59176799`。Reading 未重建，沿用08归档 SHA256 `639c6964e471ba7e3c53e4d6ae14874eea63c77671087d36198190a9fd41ba41`。精确源码与包字节清单：`C:/Users/pc-zzy/Documents/ChatGPT/deepseek-harness/worktable09-final-receipt.json`。此清单不代表真实官方管理验收已执行。


## 2026-10-20 最终安装验收与独立复审（关闭09）

最终源码 `30b05d0ac60345dbffdadaf2e2067b145168ce75` 经独立复审及 root 精确批准保护快进合入。Worktable 0.5.0 双资产 SHA256 `896c81bbc6526355889c07ef79137f31595a92c67250b0221e7353ff59176799`，Reading 沿用上述08归档，官方 CLI 在隔离3091安装并核对7文件。[真实安装验收记录](evidence/09-installed.json)保留版本、原生任务、回退与卸载的范围和限制；此前候选检查段落作为历史保留。

应用停用后，真实原生待答问题仍可从持久交接打开同一会话并回答完成；新实例、prepare及专用未发送prepared任务submit均409 application-disabled，未自动停止已有任务。第二次真实待答在停用后通过全局交接显式Stop，原生显示“已停止”且问题消失。官方Reading插件开关后贡献缺失有诊断，仍可打开原会话。

真实安装旧0.4.0遇schema2报503 schema-incompatible，六个状态文件逐一摘要不变；同SHA重装09后停用策略恢复。用户显式全部启用写回schema1，再真实回退旧版，最新4条共108分钟的业务记录、身份、任务与授权均保留，没有倒灌旧整库。

在线管理器卸载尝试保留started包，不能称作在线卸载成功；成功路径为停止独立Host后用官方离线CLI与正确existing store/cache参数卸载整个Worktable。原生界面工作台入口消失，同一10fc历史会话及未发送原生草稿仍在；同SHA官方重装后快照比较通过。最终10实例、14任务、10次原生用户输入及4项公共能力保持。

独立冻结源码58项回归和最终产物导航1/DOM8/目录3通过；作者pack170/170零skip。原生管理器没有异步卸载否决hook，交接入口只提供明确准备与控制，不自动证明任务已处理；整个Worktable卸载后使用原生会话列表控制。进程重启验收用精确拥有PID终止，不能宣称正常排空退出；真实profile未注入磁盘/ACL故障，失败发布由公开合成夹具验证。六个历史改动、原生/upstream状态及index由保护guard核验，未改正式3080或远端。仅关闭09，10继续实施，11等待10验收。
