---
id: harness-rc3-adoption-workflow
title: 固定来源计划、实例接管回执与失败恢复
parent: harness-rc3-legacy-adoption
status: in-progress
implementation_status: partial
acceptance_status: pending-installed-native-and-concrete-confirmation
target: 0.2.1-rc.3
---

本切片实现应用自己的接管计划与回执。09 和 HU08 保持开放；没有正式 apply，没有启动第二个宿主读取正式 home，没有复制正式原生消息或配置。

公共平台补充 Host-only ensureInstance/ensureView：固定 UUID 与 operationId 在一个平台写入中登记目标及所有权回执。未归属或冲突目标拒绝，重启重试返回原目标；浏览器普通创建仍不接收自选 ID。使用该能力后平台状态为 schema5，所有平台写入集中保留它；旧版读取失败，未知未来版本不写回，不以整份旧 profile 恢复绕过。

纯计划验证09a七份完整源文件哈希及 revision，并在输出可执行状态前逐条检查六领域记录和 global。解析会丢字段、补默认或改变值的记录阻止计划，不归一化答案、成绩或提交顺序。目标 ID 在计划内冻结；知识暂全部私有，只有09d提供并重新验证的正向来源证明才可进入资料库（接入仍在进行）。源题库进入资料库，历史实例的只读授权明确列在具体计划中；新学习实例不继承。

接管通过已认证的 /api/kaogong/adoption 的 prepare/inspect/export/apply 操作，或应用内部 Host 所有者接口。请求只能选择已在服务端配置的 legacy-default 来源和已存计划 ID；不能提交路径、绑定身份、目标实例或业务记录。apply 必须同时给出具体指纹及 confirmed:true；挂载、预览和导出不创建目标或发送原生消息。

immutable plan 和小 checkpoint 位于两个新的应用元数据域，避免每个记录回执重写完整3994行计划。写入仅调用公共 Domain/KvTable；每20条同实例记录持有受控业务租约，阶段之间复核七份源字节。记录写入前保存意图；丢失写回执后重读目标值确认，不再 put。目标不匹配时停止，不覆盖新值。原生绑定走公开 inspectLegacySource/previewAdoption/applyAdoption，阶段开始/结束重新核对原生事实，不创建或复制老师。

接管中的目标被隔离，HTTP、工具、资源和任务都不能读写半完成数据。私人知识分类在导入前写入；其原内容仍可经所属实例的私有教学上下文使用，不进入可共享原始材料。未知或失败保持原数据，只能显式确认同一计划后按回执恢复；没有后台重试或整体 profile 回滚。

已验证：公共实际 rc.3 类型编译；配置错误提示的客户端红绿回归6/6；平台 provision/composition/lifecycle21/21；纯计划2/2；受控故障工作流1/1。生产路由的真实 rc.3 JSON 域回归中：确认前零目标、写入后丢回执造成 unknown 并隔离目标、源文件多一个空格仍拒绝恢复、恢复原字节后重启沿同一目标继续、私有讲义可自用但不可共享、重复 apply 不再 put、不增加目标、七份旧存储不写入。这是合成数据接口回归，不等于正式学习/原生角色闭环。

剩余：09d材料证据和逐资产所有权读取、缺失/冲突源与原生事实的完整矩阵、较大合成库的实际性能、离线脱敏预览导出、正式具体预览和最终用户确认、安装后的实际原生会话接管与恢复。执行时应停止旧插件对源存储的写入；阶段哈希检查不能锁住其他进程或承诺最后一次检查后文件永不变化。
