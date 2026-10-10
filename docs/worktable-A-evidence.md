# Worktable A 实现与验证（2026-10-03）

采用原型 A 的固定左右分栏。DSH 原生新建会话、技能中心、插件、自动化任务、工作区树、设置及原生会话保持原有实现。插件只增加工作台（下属考公学习）、Agent 和 Skills 三个独立入口；原生导航优先，切入原生页面时关闭新增界面的显示，应用实例与草稿继续保留。

1. 工作台直接显示应用，取消重复目录和浮动窗口操作。
2. 考公内容与原生角色会话持续分栏，宽度可调并持久化；角色创建、恢复和错误重试可见。
3. Agent/Skills 独立持久化管理，应用可显式复用；更换角色 Agent 创建新会话，原会话保留。任课老师的教学规则限定在对应角色作用域。
4. 原生 list_capabilities/run_agent 支持模型发现及调用，校验调用权限、继承原生权限策略、处理取消并保存执行记录。

## 已验证

- pnpm run build：两插件 Host/Client、声明及源代码消费检查通过。
- DSH_SOURCE 指向官方构建，node --import tsx --test plugins/personal-workbench/tests/*.test.mjs plugins/personal-workbench/tests/role-bindings.test.ts plugins/kaogong/tests/classroom-layout.test.tsx：56/56 通过。
- 原生 AgentLoop、ToolRuntime、Skill loader 和 JSONL 持久化使用确定性模型适配器验证真实组合与调用；未向外部模型发送本轮验收任务。
- @Browser 正式 3082 验证原生入口、考公分栏、原生插件导航、返回后角色保留及独立管理创建。3083 为隔离原型，现也展示保留的原生入口。
- 正式接口及历史图片返回 200，78651 字节图片与原文件一致；题库 3994、知识资料 72，原四个学习数据文件 SHA256 均未变。

原型存档在 codex/prototype-worktable 分支的 .local/prototype；主分支不包含原型服务。旧 kaogong 路径兼容连接仍保留，未清理资料或历史数据。
