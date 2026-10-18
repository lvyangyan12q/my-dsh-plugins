# 04 最小深度应用接缝（实施中，待10冻结）

协议版本1延续03的应用/实例/视图身份。以下是04实际接口，不是未来授权或AI协议。04仍待最终隔离安装的真实UI验收；05、06、07未因此完成。

## Host贡献

可信Cordis插件通过 `ctx.inject(['worktableApplications'], child => …)` 取得平台服务，在该子生命周期内执行 `const withdraw = await child.worktableApplications.contribute(definition)`。将返回的撤销函数绑定同一子ctx的effect；依赖重新可用后重新贡献。定义为：

```ts
{ id: 'reading-statistics', title: '阅读统计', version: '0.1.0',
  protocolVersion: 1, kind: 'deep',
  views: [{ id: 'page', title: '完整阅读页' },
          { id: 'stats', title: '统计' }, { id: 'list', title: '列表' }] }
```

必须有完整 `page`；视图局部键不可重复，协议版本不兼容、重复贡献或已登记的网页身份冲突均拒绝。普通网页管理HTTP不支持贡献深度组件。撤销仅撤销定义可用性，耐久实例及视图记录保留；重新贡献同一应用后恢复原有身份。贡献定义不冒充独立安装的应用：插件缺失时原有视图明确不可用。

`createInstance(appId, projectId|null)` 只在显式新建调用。`latest`/`resume` 继续03语义；`createView(instanceId, viewType='page')` 只接受声明的视图键，返回新viewId和原instanceId。`resolveView(viewId)` 返回 `{application, instance, view}`。目录及快照包含活跃贡献，贡献定义本身随插件生命周期重新建立。深度应用ID以`deepApplicationIds`附加到schema1配置中耐久预留；撤销/重启后不可改成同ID普通网页，否则旧实例会被静默重定向。深度贡献与网页登记在同一写入队列内检查冲突并提交，提交成功后才发布内存贡献。

## 客户端贡献

可信客户端插件通过 `ctx.inject(['worktableApplicationViews'], child => …)` 取得唯一服务，并将 `child.worktableApplicationViews.register(appId, {page: Page, stats: Stats, list: List})` 返回的撤销函数绑定子ctx生命周期。平台只承载声明的组件，不导入业务应用、旧personal-workbench前端或配方渲染器，不给应用任意原生ctx。

每个React组件收到 `{application, instance, view}`。`instance.id` 是应用状态及数据归属，`view.id` 是展示身份，`view.type` 是应用声明的局部键，`instance.projectId` 可为null。当前会话、目录、窗格编号不作为这些身份。应用自己拥有UI、数据、私有能力和状态订阅；Worktable保留唯一布局所有权。纯展示不要求角色或原生会话，同会话编辑器仲裁不通过新建Session规避。

组件卸载、关闭、池淘汰及贡献撤销只能释放视图订阅/临时读取，不能删实例、业务记录或停止原生任务；异步数据及动作需在应用内检查实例身份与卸载所有权。平台的resolve同样使用AbortSignal和generation校验，迟到A响应不能覆盖B。

普通网页仍按03的sandbox/origin策略打开。深度组件是可信插件代码，并非网页权限升级。Operator准入不是实例资源授权；数据只读共享、受控写入和撤销在05单独处理，私有角色及AI在06/07处理。此接缝不声称提供这些能力。

## TDD辅助证据

`application-entry.test.mjs` 通过公开贡献/创建/解析验证生命周期恢复、项目/显式新实例身份独立和模块类型拒绝；同名已登记网页不能被深度贡献覆盖。`application-component.test.mjs` 使用真实React，验证插件组件接收显式身份、撤销释放挂载且没有Session请求，并保留03迟到响应A/B回归。主验收仍以最终安装包的完整用户路径为准。

应用目录默认继续当前app/project最近实例；卡内折叠“其他实例”仅列同一作用域内较早实例。显式选择旧实例调用resume，并复用其持久viewId；不会新建实例或Session，不复制记录。最新实例始终使用原“继续最近实例”入口。

## 06角色与公共能力（实现已准备，真实安装验收待补）

可信Host插件可选依赖 `worktableRoles`，在同一子ctx生命周期贡献 `contribute(appId,[{id,title,agent:{kind:'agent',source:'managed',id},creation:{cwd:absolutePath},skills?:CapabilityRef[]}])`，返回撤销函数。角色无教学必选字段；完整角色身份为实例ID+角色ID（实例目录验证所属app）。应用私有Agent/Skill通过 `worktableCapabilities.contribute(appId,[{kind,id,title,presetId? ,provider?,enabled,userInvocable,modelInvocable}])` 贡献，仅对同ownerAppId可选；原生安装由所属应用拥有。

公共目录仅来自派生Worktable的“Agent / Skills 管理”保存记录。不会自动导入原生Preset或文件系统Skill，也不加载personal-workbench旧前台或管理执行器。管理保存使用revision，调用许可和停用持久保存。公共Agent注册原生 `worktable.managed.<id>`；Skill核对精确provider和Agent scope、complete目录；同名不同来源拒绝。已有旧personal-workbench记录不静默迁移。

Host服务 `list(instanceId)`、`read(instanceId,roleId)`只读；`ensure(instanceId,roleId,agent?)`显式创建；`retry(instanceId,roleId,sessionId,revision)`仅重试intent同ID；`replace(instanceId,roleId,sessionId,revision,agent?)`显式分配新ID并保留历史；`attach`禁止使用另一角色/实例当前或历史ID；`resolve`给07按revision+SessionID复验；`open`/`history`仅返回受校验当前或历史ID，不创建。应用视图props可选 `roles` 是已绑定该实例的操作facade，无任意Host/native context。HTTP不开放通用native操作或attach。

每个profile只有一个roles.v1.json所有者（含PID锁，另一个活Host拒绝；崩溃PID确认已退出才回收锁）。绑定和普通应用业务state分离。持久intent使用预分配SessionId、原子写入+文件sync后才调用rc.2公开sessionController.create，显式已登记Workspace，sessionPersistence.flush后提交ready。落盘失败保留intent，重试同ID；不以新Session掩盖能力/原生会话缺失。准备操作、视图关闭与恢复均不发送、不Stop、不归档、不删会话。

本轮只有原生导航一个composer，应用角色面板不嵌第二输入框，不复制/覆盖草稿。多视图只导航同Session，跨浏览器文本实时协作未承诺。原生历史和未发送草稿、空白Session跨Host重启恢复必须用最终安装包实页核实，下面辅助测试不代替该验收。任务发送、上下文准备与执行审批属于07。
