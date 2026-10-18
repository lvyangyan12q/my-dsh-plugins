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

`createInstance(appId, projectId|null)` 只在显式新建调用。`latest`/`resume` 继续03语义；`createView(instanceId, viewType='page')` 只接受声明的视图键，返回新viewId和原instanceId。`resolveView(viewId)` 返回 `{application, instance, view}`。目录及快照包含活跃贡献，贡献定义本身随插件生命周期重新建立。

## 客户端贡献

可信客户端插件通过 `ctx.inject(['worktableApplicationViews'], child => …)` 取得唯一服务，并将 `child.worktableApplicationViews.register(appId, {page: Page, stats: Stats, list: List})` 返回的撤销函数绑定子ctx生命周期。平台只承载声明的组件，不导入业务应用、旧personal-workbench前端或配方渲染器，不给应用任意原生ctx。

每个React组件收到 `{application, instance, view}`。`instance.id` 是应用状态及数据归属，`view.id` 是展示身份，`view.type` 是应用声明的局部键，`instance.projectId` 可为null。当前会话、目录、窗格编号不作为这些身份。应用自己拥有UI、数据、私有能力和状态订阅；Worktable保留唯一布局所有权。纯展示不要求角色或原生会话，同会话编辑器仲裁不通过新建Session规避。

组件卸载、关闭、池淘汰及贡献撤销只能释放视图订阅/临时读取，不能删实例、业务记录或停止原生任务；异步数据及动作需在应用内检查实例身份与卸载所有权。平台的resolve同样使用AbortSignal和generation校验，迟到A响应不能覆盖B。

普通网页仍按03的sandbox/origin策略打开。深度组件是可信插件代码，并非网页权限升级。Operator准入不是实例资源授权；数据只读共享、受控写入和撤销在05单独处理，私有角色及AI在06/07处理。此接缝不声称提供这些能力。

## TDD辅助证据

`application-entry.test.mjs` 通过公开贡献/创建/解析验证生命周期恢复、项目/显式新实例身份独立和模块类型拒绝；同名已登记网页不能被深度贡献覆盖。`application-component.test.mjs` 使用真实React，验证插件组件接收显式身份、撤销释放挂载且没有Session请求，并保留03迟到响应A/B回归。主验收仍以最终安装包的完整用户路径为准。
