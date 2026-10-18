# 现有平台能力迁入前的边界核对

本文件为本地源码事实及设计建议，不是已迁移证据。研究期间未改插件、未启动Host、未调用模型。

## 可复用的现有契约

- 应用目录已经提供registerApp/openApp和稳定应用/实例标识，元数据含页面、依赖和角色；可作为新注册接口的行为参考，但当前包含旧工作台窗口语义，不能把旧前台一并加载。[workbench-api.ts](../../../../plugins/personal-workbench/src/workbench-api.ts:12)
- 角色键为appId、instanceId、roleId及可选subject；ensure/read/retry/replace分离，旧Session引用保留。该能力可迁入新内核，但必须与新项目/实例身份明确映射，不能用当前激活项目或窗格序号推导旧角色键。[role-binding-api.ts](../../../../plugins/personal-workbench/src/role-binding-api.ts:7)
- 数据接口load/subscribe接受appId、instanceId、preview，数据目录是当前进程Map。适合作为数据展示适配起点，不是共享授权系统，也没有项目维度或通用写入动作。不能把现有数据源注册理解为任意跨应用数据许可。[display-api.ts](../../../../plugins/personal-workbench/src/display-api.ts:10)
- 任务上下文包含目标RoleBindingKey、来源页面/模块、可编辑任务和上下文块，可复用准备与发送分离的语义。[task-api.ts](../../../../plugins/personal-workbench/src/task-api.ts:6)
- 当前RecipePage主动选择每个角色的对话承载位置，避免重复编辑器。它是旧配方视图实现，不能推导为任意Worktable多窗格共享编辑器已获解决。[recipe-view.tsx](../../../../plugins/personal-workbench/src/recipe-view.tsx)

## 必须在迁移时收敛的耦合

通用角色接口内仍存在TeachingEvidence、teach、sendTeaching及教学前置配置，这些属于应用教学场景。它们不能成为所有新应用的必选接口，应在新结构中归为应用专属适配，保留旧调用兼容和历史数据。[role-binding-api.ts](../../../../plugins/personal-workbench/src/role-binding-api.ts:46)

既有应用私有角色与公共Agent来源有明确策略。迁移时应保留私有角色可继续使用、不可冒充新增公共能力的规则，不因为简化接入而放开未声明的能力。[recipe-role-policy.ts](../../../../plugins/personal-workbench/src/recipe-role-policy.ts:6)

## 第一版建议：少量稳定的外部接口

1. 应用只声明自己的入口、可嵌入视图和需要的平台能力；不持有Worktable分栏引擎或原生全局ctx。
2. 平台为打开的视图提供显式实例上下文；实例状态与窗格挂载分开，视图关闭不会删除实例或自动停止任务。
3. 同实例多视图共用实例所有者，状态订阅可多份；同一原生Session的输入/编辑器所有权必须另设仲裁，不能仅因状态共享就重复挂载编辑器。
4. 数据共享使用显式获准资源引用，实例隔离不复制整份资料；应用自行解释业务权限，平台不以同一个appId作为跨项目访问许可。
5. 原生会话、审批、Stop及Skill执行继续通过实际DSH接缝；集中适配是代码组织方式，不意味着可以凭空提供原生未开放的能力。

## 需要接缝验证的最小探针

一个独立网页可打开、受限嵌入可反馈；一个原生模块可注册/撤销；同实例两视图状态共享但不重复建Session；不同项目实例状态与会话隔离；显式共享同一资料源且不混会话；关闭视图后任务可继续并能找回；缺能力时可解释、不能静默降级发送；刷新/重启恢复同身份。

这些是未来验证提案，尚未执行，不替代旧验收。
