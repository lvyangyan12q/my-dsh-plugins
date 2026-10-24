---
id: harness-rc3-review-admission-recovery
title: 接管实例准入与已证实未发送的所有者恢复
parent: harness-rc3-legacy-adoption
status: implementation
implementation_status: implemented-source
acceptance_status: pending-installed-native-and-concrete-confirmation
target: 0.2.1-rc.3
---

处理 a81ac77..950b5a9 双轴复审 P1/P2/P3。正式 HU07/HU08、安装包与真实 AI/桌面验收保持开放。

平台 schema5 增加 instance-admission 回执 pending/ready。ensureInstance 原子写入隔离标记；旧 schema5 instance 意图无标记也视为 pending，显式同计划恢复补齐标记。普通新建实例不受影响。实例恢复/关联/视图读取、角色创建/读取/替换/附加/重试/工具上下文，以及通用任务和资料路径复核目标准入；资料目录跳过隔离目标，其他可用来源继续显示。平台只读自己的回执，不检查考公私有存储。

受信任 Host withProvision 使用有期限的 AsyncLocalStorage 作用域，绑定操作与应用贡献代际。浏览器提供 operationId、viewId、instanceId 均不能产生能力。作用域只容许导入读取/共享及原身份接管，不允许角色新建或任务发送；异步后代在回调结束后失权。completeProvision 需要同一有效作用域，工作流先持久化 applied，再逐目标完成平台回执。完成回执丢失后，显式重启恢复只补完成，不重导记录或发送原生消息。卸载/贡献更换或所有者缺失时 pending 保持拒绝。

本次仍处于未冻结 rc.3.2/schema5 契约，不新增冻结版本。新 receipt kind 使此前只识别 instance/view 的 schema5 读取器拒绝整个状态；回退必须保留当前文件并恢复兼容实现，不能删标记或降 schema 绕开。

应用任务在 beforeSubmit 所有者声明之后若资源租约/再次验证失败，持久化 failed + ownerRejection pending，表明本路径未调用 native.prompt。显式 recover-owner 调用 notAdmitted；失败或丢回执保留 pending，重启可继续，成功 done 幂等。不会自动重发。未知传输或 submitting 无明确未准入证据仍保持 uncertain，不能清除 claim。beforeSubmit 与恢复回调均在资源私有租约外。

考公 reviewClaim 固定 taskId/requestId；释放前有 releasing 回执，按匹配身份恢复 ready，最后 rejected。旧清理重试不能释放后来任务的声明。准备指纹排除这类准入元数据；成绩与原业务内容不改写。通用任务面板为 failed/pending 提供同一明确恢复按钮。

P3 将三处快照 envelope/重复名/严格 base64/字节哈希/sourceRevision/具名 JSON 读取集中到 legacy-inspection-envelope.mjs，领域名、版本与表结构检查仍由每个领域保留。沿用原格式解析错误及只读证据输出。

红绿证据：新增实例隔离测试在修复前真实 roles.ensure 未拒绝；新增未发送恢复测试在修复前缺 ownerRejection。修复后真实平台与生产考公 Host 合成夹具覆盖重启隔离、同 pinned 身份接管、零 Native create/prompt、资料撤销在 claim 后发生、声明身份错配、旧清理不影响新声明、清理丢回复后的任务文件重开，以及 applied 平台完成丢回复恢复。host 141/141 与实际公开 Native Host 类型检查通过；定向平台角色/任务/HTTP/面板测试通过。这些源级接口回归不替代正式安装或真实模型闭环。
