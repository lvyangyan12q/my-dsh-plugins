# 07 原生任务接缝（阶段实现）

这是首阶段实现契约，后续10会统一冻结协议。真实安装、模型、工具、问题、审批和Stop由主任务在独立3091验收；下面的源码测试与产物检查不代替该验收。

## 用户路径

深度视图保留“应用角色”和折叠“AI任务”，没有第二套原生输入框。通用任务先选择角色、准备正文，或由应用模块调用 `props.tasks.prepare({roleId,text,contexts})`。阅读模块提供“准备阅读AI任务”，记录当时选中ID和分类/状态/搜索筛选；业务资料由阅读Host解释，不信任网页传来的完整资料。

任务准备记录属于实例，来源viewId/type、实例revision、角色及其sessionId/bindingRevision固定。可以编辑正文和上下文、移除上下文或放弃；只有“确认发送到原生会话”发起一次受控Host提交。编辑尚未保存时不能发送原版本。查看历史任务沿固定sessionId复用既有原生导航marker，保持工作台布局。

“准备任务正文”是未发送的准备表单；点准备后持久保存，编辑后点保存才更新准备记录。原生会话文字仍由原生单一composer拥有；平台不复制其草稿。挂载、刷新列表、打开/关闭视图均无prompt或Stop副作用。

## Host公开边界

认证POST /api/worktable/tasks 只接受 action/viewId/id/revision/roleId/text/contexts。每次从已登记deep view推导实例，不接受任意instanceId/sessionId/发送渠道。动作：list、prepare、edit、discard、submit、open、stop。edit只能保留/移除原有context ID并修改其展示文字；授权metadata不由浏览器改写。prepare/edit正文上限24000字符，每组上下文上限16000字符，最多8组且总计32000字符。资源selection引用本身有4096字符边界。

资源所属应用可选声明 taskContext(value,selection)，返回title/text；并声明稳定的 withTaskLease(operation) 闭包，使用自己的写队列保持同一业务revision直至原生准入返回。该闭包是租约权威，不得依赖调用this；共用同一写队列的多个resource必须复用相同函数身份，避免嵌套排在自己之后。平台按此权威去重。未知协议/没有owner租约的资源拒绝AI上下文接入，不退回任意实例数据接口。

资料准备与发送分别读取05受控资源；记录owner app/instance、resource revision、grant ID/revision及selection，指纹同时绑定owner渲染的源标题/正文。编辑展示文字不扩大权限，移除上下文同时移除授权引用。发送紧前发现撤销、换源、资料变化、角色替换、实例归属变化就阻止，要求重新准备。

## 原生准入与恢复

每个profile的AdmissionGate串行平台应用配置变更、角色变更、公共能力保存、授权变更及任务准入；等待gate后才进入各自pending队列。锁只覆盖准入，不等待模型完成。资源owner写队列租约覆盖最后读取、角色resolve、耐久提交意图和原生prompt准入。ALS可重入令牌只在该操作有效；进入native.prompt时显式退出特权上下文，其异步后代不得绕过队列。

提交前耐久写入固定requestId、sessionId、mode=queue和不可变payload。再次复验后仅调用公开sessionController.prompt一次；没有备用渠道、换Session或自动重试。accepted回执后sessionPersistence.flush再保存accepted。调用后超时、异常、回执或状态保存不确定均unknown；重开遗留submitting也展示unknown。重复submit只返回原记录，即使旧grant随后撤销也不会重新访问或重发。准备与提交日志沿用已验证的profile文件锁/fsync/临时文件rename持久写原语，tasks.v1.json独立保存任务（兼容该原语schema1的空bindings/capabilities字段），不会修改原角色状态文件。

accepted只表示原生接纳，不能当模型完成或业务成功。展示原生公开running/pendingInteraction/completionUnread及已观察lastAgentError；未运行仅写“原生当前未运行；结果请查看轨迹”。状态不可见时明确未观察。原生问题、审批、完整轨迹和输入沿同会话原生视图。

Stop作用于历史task记录的原生sessionId当前回合，保留排队消息、不回滚已发生写入，不声称精确取消某个排队request或已取消成功。已经提交的accepted/unknown及重开submitting意图都可查看/Stop，不依赖当前角色可用性。独立stopRequestedAt更新在原子状态写中保留，晚到accepted不能覆盖它。关闭视图、替换角色或停用公共能力不会调用Stop。

## 范围与限制

平台锁约束本插件受控操作；不对其他插件或用户直接修改原生Agent/Session提供跨全宿主事务。已发送资料留在原生历史，撤销只阻止后续受控访问。网页没有此能力facade。角色管理、模型、工具调度、问题和审批仍归原生DSH，无原生源码补丁、第二套聊天或旧个人工作台前台加载。

本轮同时修正 tasks/roles/resources 三个认证平台HTTP路由的UTF-8跨网络块解码，按原字节上限累计后一次解码；应用管理原路由已有setEncoding和逐字节中文回归，不作无关改写。

## 辅助验证

公开任务API、认证HTTP、React准备面板；实际ApplicationDirectory/ResourceDirectory/RoleDirectory共gate；官方rc.2 StorageDomain阅读owner及真实React数据控制。故障注入覆盖并发send、过期/撤销、未知恢复、准入后代、共用owner队列、历史Stop及晚到审计、三路由中文逐字节传输。native.prompt边界在这些测试中使用受控适配器；真实模型执行仍须独立Host实际操作。

阅读check-types.mjs辅助检查使用 DSH_SOURCE=未经补丁rc.2独立runtime、READING_LEGACY_ROOT=当前main，仅借用未改动旧适配器的生成types；这不是从零构建旧前台，也不是运行期依赖。最终reading tgz的安装/导入检查不使用临时类型映射或symlink。
