# 项目便签

独立的便签应用，接入 Worktable 协议1。完整页编辑标题、正文和归档状态；“便签摘要”模块显示同实例筛选后的数量与选择。业务记录归自己的官方 `project_notes` StorageDomain v1；不同实例不共用记录。

从应用目录显式新建实例，再添加该实例的摘要视图。搜索和选中项在同一浏览器的同实例视图共享，保存后的记录由Host持久保存。编辑草稿属于当前视图，保存前不算持久业务记录；旧版本保存冲突会保留表单并提示，不自动覆盖。

## 可选整理助手

安装不自动选择公共能力、不创建会话、不发送消息。原生插件配置中显式填写：

- `settingsVersion`：1。
- `managedAgentId`：Worktable公共管理中已保存、启用且适用的通用Agent精确ID。
- `managedSkillId`：同目录中适用、允许模型调用的公共Skill精确ID。
- `roleWorkspace`：原生已登记Workspace的绝对路径；普通目录存在不等于已登记。

三个字段缺失时便签仍可浏览编辑，助手未配置。原生角色面板再显式创建角色会话。修改已有角色Agent需要明确替换，保留原会话历史，不会自动迁移。

本应用注册私有 `project-notes-format` Skill（provider `project-notes`，model-only），仅贡献应用owner目录，不写入公共管理。角色还显式引用用户选择的公共Skill。原生实际加载须由 `tool-skill` 轨迹证明，引用通过不等于模型已经加载。

“准备便签整理任务”将选中便签和筛选交给Host校验，进入现有AI任务面板。用户可以编辑、移除上下文或放弃；只有明确发送才进入原生角色Session。回复不会自动回写便签。原生问题、审批、轨迹和Stop沿同一原生界面；Stop只请求当前会话回合，保留队列，不回滚已有写入。

## 接入与边界

包使用 `dsh-worktable/sdk` 的公开类型/无副作用协议检查及Cordis可选服务，不导入平台或Reading私有模块，不依赖legacy类型映射。客户端仅注册page/summary，布局和原生输入仍归平台。

资源只支持 `project-notes-records` 自有便签schema与同应用显式共享。引用保持owner/consumer归属；默认只读，动作需单独授权。页中没有通用跨应用共享浏览器；未知resource/schema或Reading记录不会被自动当便签复制或转换。同源可信插件不是恶意插件的安全沙箱。

普通网页没有这些深度服务。跨浏览器不承诺实时推送，可显式“刷新便签与权限”。只支持单个官方StorageDomain facility业务所有者，不承诺两个独立Host共享任意backend并发写。关闭视图/撤销注册不会删除业务行或Stop原生任务。

## 构建与证据范围

在本目录 `npm run build` 生成Host ESM和客户端ModuleLoader工厂；`npm run test` 需 `DSH_SOURCE` 指向官方已构建rc.2。严格类型检查使用发布SDK声明及官方native public types，不借用旧personal-workbench声明。

源码测试中，官方StorageDomain与SkillRegistry实际运行，Task native prompt仍是受控系统边界。真实安装/模型Skill加载/原生执行由root独立验收，不以此README或测试退出码宣称通过。应用尚属10候选，不关闭工单。
