# 09/05: 数据模块的原生角色结果入口

基线 e9897a7。父层实际阅读应用的 filter/stats/list/detail 中完成了原生角色任务，但数据模块仅留下待发送编辑区，无法从应用查看会话与任务结果。规格继承应用内可见 DSH 原生对话和轨迹要求，本切片补齐入口；不复制或模拟聊天 UI。

实现：绑定角色的数据模块显示“查看角色对话”。每个应用实例沿用完整 role binding key；全配方优先复用已有 role-chat，其次现有自定义生成模块，否则选择一个数据模块作为折叠宿主。其它数据模块通过既有 Workbench selectPage 切到宿主页并展开。没有既有宿主时，用户首次展开调用正式 personal-workbench.role-conversation factory；折叠与跨页保留组件和未发送原生草稿。此入口不自动创建任务或发送模型消息。预览不显示入口、不创建角色会话。

公开 source Client DOM RED：真实任务准备和显式发送后找不到 moduleRoleConversation 按钮。GREEN：新回归通过，验证发送后入口、展开/折叠同一组件及草稿、跨数据页面单一宿主、跨页已有 chat 复用；factory 边界提供测试组件用于计数，不声称展示了实际模型文本或真实轨迹。

定向：data-role-conversation / recipe-editor / recipe-canvas / recipe-authoring-lifecycle 8/8；personal-workbench check-source 类型检查通过。首次目标 test 命令路径错误为 harness 前置错误，不计产品 RED。

剩余：父层安装此提交后须在实际阅读应用查看已经完成的原生结果、轨迹和会话身份，检查入口布局与折叠，以及其它角色/实例隔离。没有新增 Host 路由或修改记录；现有自定义生成模块内部的跨页多宿主行为不在本数据入口切片重写。工单 09/05 保持 open。
