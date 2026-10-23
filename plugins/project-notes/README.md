# 项目便签 0.2.1（源码候选）

独立的便签应用，接入 Worktable 协议1。完整页编辑标题、正文和归档状态；“便签摘要”模块显示同实例筛选后的数量与选择。业务记录归自己的官方 `project_notes` StorageDomain v1；不同实例不共用记录。

从应用目录显式新建实例，再添加该实例的摘要视图。搜索和选中项在同一浏览器的同实例视图共享，保存后的记录由Host持久保存。编辑草稿属于当前视图，保存前不算持久业务记录；旧版本保存冲突会保留表单并提示，不自动覆盖。

## 可选整理助手

安装不自动选择公共能力、不创建会话、不发送消息。原生左侧“插件”→已安装的 Project Notes → `project-notes` 行“配置”，显式填写后点击“保存角色配置”：

- `managedAgentId`：Worktable公共管理中已保存、启用且适用的通用Agent精确ID。
- `managedSkillId`：同目录中适用、允许模型调用的公共Skill精确ID。
- `roleWorkspace`：原生已登记Workspace的绝对路径；普通目录存在不等于已登记。

`settingsVersion`仍为1，不在表单中编辑。三个字段缺失时便签仍可浏览编辑，助手未配置。原生角色面板再显式创建角色会话。修改已有角色Agent需要明确替换，保留原会话历史，不会自动迁移。

本应用注册私有 `project-notes-format` Skill（provider `project-notes`，model-only），仅贡献应用owner目录，不写入公共管理。角色还显式引用用户选择的公共Skill。原生实际加载须由 `tool-skill` 轨迹证明，引用通过不等于模型已经加载。

“准备便签整理任务”将选中便签和筛选交给Host校验，进入现有AI任务面板。用户可以编辑、移除上下文或放弃；只有明确发送才进入原生角色Session。回复不会自动回写便签。原生问题、审批、轨迹和Stop沿同一原生界面；Stop只请求当前会话回合，保留队列，不回滚已有写入。

## 接入与边界

包使用 `dsh-worktable/sdk` 的公开类型/无副作用协议检查及Cordis可选服务，不导入平台或Reading私有模块，不依赖legacy类型映射。客户端仅注册page/summary，布局和原生输入仍归平台。

资源只支持 `project-notes-records` 自有便签响应schemaVersion1与同应用显式共享；未知版本明确拒绝。引用保持owner/consumer归属；默认只读，动作需单独授权。页中没有通用跨应用共享浏览器；未知resource/schema或Reading记录不会被自动当便签复制或转换。同源可信插件不是恶意插件的安全沙箱。刷新遇撤销/访问失败会清除当前列表、版本及引用展示，保留错误；未保存本地编辑不会被当作有效业务记录自动发送。

普通网页没有这些深度服务。跨浏览器不承诺实时推送，可显式“刷新便签与权限”。只支持单个官方StorageDomain facility业务所有者，不承诺两个独立Host共享任意backend并发写。关闭视图/撤销注册不会删除业务行或Stop原生任务。

## 构建与证据范围

在本目录 `npm run build` 生成Host ESM和客户端ModuleLoader工厂；`npm run test` 需 `DSH_SOURCE` 指向官方已构建rc.2。严格类型检查使用发布SDK声明及官方native public types，不借用旧personal-workbench声明。

源码测试中，官方StorageDomain与SkillRegistry实际运行，Task native prompt仍是受控系统边界。真实安装/模型Skill加载/原生执行由root独立验收，不以此README或测试退出码宣称通过。应用尚属10候选，不关闭工单。

配置页使用官方 `plugins.row.config` 与该行原生 Settings/ConfigEditor；三个字段作为 volatile 引用一次携带读取时 revision 保存，陈旧版本拒绝并保留草稿。Settings→内置插件是只读清单，不是填写位置。保存不创建/更换会话或发送消息，角色声明生效后刷新便签与权限；已绑定角色需要变更 Agent 时仍须明确替换，旧历史不会被改写。配置服务不可用时明确显示原因，不写 profile 文件绕过。settingsVersion仍是普通配置门禁，不在本页编辑。


0.1.2修正共享资料的动作权限展示：新建草稿按create许可，已有便签编辑按update许可，归档按archive许可分别控制。界面只提交被许可的明确动作；Host原有授权与revision校验继续生效，权限不因编辑器状态获得提升。


## 0.2.1 dual-host compatibility candidate

Native peer ranges explicitly name official DSH0.2.0-rc.2 and0.2.1-alpha.2, with their actual Cordis4.0.4/4.0.5-alpha.1 (and Notes Schemastery3.18.4/3.18.5-alpha.1). Native storage-domain is a host-provided peer, not an optional package dependency that can silently install another runtime. Its real defineDomain/domainTable import remains external; installation must provide that service. No peer bypass/native patch is part of this candidate.

Public producer checks install the exact frozen Worktable archive and selected official native public packages in an independent directory, assert shared Cordis identity and compile with skipLibCheck=false. Candidate source/compilation is distinct from final official package installation, peers check and actual two-host UI acceptance, which remain root release gates.

Release entry is npm run pack with DSH_SOURCE, WORKTABLE_PACKAGE and npm_execpath. Existing dist/vVERSION directories are refused before tests/build/install; published stable and versioned filenames are copied exclusively. Bad assets require a new version. Source-only preparation does not create a frozen package or alter any profile.
