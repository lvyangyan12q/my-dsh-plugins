# 04: 高级角色选择目录与剩余真实验收路径

基线 000048a7（已同步 integration）。发现：模块内 RecipeRoleSettings 过滤 managed Agent/Skills，但高级 RecipeRolesEditor 从全部 native presets 生成可选项，错误地暴露应用私有老师为可复用能力。Host policy 原本拒绝跨应用借用，不放宽它。

RED：公开高级角色下拉收到真实目录形状（managed reviewer + private native teacher）后仍含可选 private teacher。GREEN：选择只来自 managed Agent（停用项显示不可选），加工作台专用 builder 例外；已有应用私有 preset 原 ID 保留为不可选的“已有私有角色”引用，不标为目录缺失、不借给新角色。确实缺失或停用引用仍显式报错。

补充公开 RoleConversation 回归：更换声明后旧 Session 有历史入口；取消 native confirm 不调用 replace；明确确认只带原 key/Session ID 发替换命令。真正 Host 的替换历史与同 ID 恢复由已有公共持久回归验证。

定向：公开 editor/history 3/3，recipe/management Host 11/11，capability/native-skill/role-bindings 24/24，source types 通过。官方 native engine 相关测试的模型边界使用声明的测试 adapter，只证明 preset/Skill/工具装载契约，不代替安装实例的真实模型结果、历史内容或权限错误。

## 父层最小实际 UI 序列
1. 在管理入口创建仅用于验收的 Skill 与 Agent A/B。检查公共目录仅有管理创建条目，考公老师不出现；在应用模块与高级角色设置中选择 A 与 Skill，保存/预览/启用。预览不能创建 Session，分配不称执行。
2. 实例一创建角色并记下 S1；切换同角色页面、关闭重开、刷新，确认同 S1。打开第二实例创建 S2，确认不同且本轮输入互不串用。已有应用和科目身份保持。
3. 将同角色改为 B 并显式启用。打开或准备任务不自动新建：S1 保留并显示 Agent 已变提示；旧 S1 可从历史入口打开。点新建角色会话并取消，仍为 S1；再次确认后为 S3，旧 S1 在历史且原生内容可读。真实历史不能用空 fixture 替代。
4. 仅停用自己创建的 Skill/Agent，检查缺依赖提示和既有 Session ID 保留；恢复后明确重试同 ID。若有实际归档测试条件，仅归档自己的验收 Session，检查不可访问提示、不静默重建，原生恢复后同 ID 重试。缺失/真正 permission-denied 没有合适条件就明列未验，不改 profile 制造错误。
5. 准备普通任务核对目标、来源、编辑与移除上下文；跨页后字段保留，取消不发送。浏览器刷新及 Host 冷启动普通任务恢复已存在父层实际证据；代码拥有 callback 的任务恢复后必须重新准备，不能借此自动发送，需父层在专属模型任务中核对。

本切片无浏览器通道可用；以上 UI 序列未在此 agent 实施。工单 04 保持 open，不修改原生 core/sidebar，未全构建或推送。
