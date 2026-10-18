# 05 实例资料引用协议（待10冻结）

2026-10-19。这里只记录已实施协议和辅助测试，05仍等待主任务在3091最终安装包中的真实浏览器验收，不勾选或关闭工单。

## 所有权与公开接缝

Host通过可选`worktableResources`服务管理当前profile下的`worktable-platform/resources.v1.json`。配置只保存稳定实例和资源引用，业务资料不复制到消费实例。可信应用用`register({appId,resourceId,actions,read,mutate})`注册资源；actions是最多32个稳定有界动作ID，不是平台硬编码的阅读CRUD。返回的撤销函数绑定插件生命周期，撤销资源贡献不删除记录。普通网页不能贡献handler，也不能取得原生Context。

`read(ownerInstanceId,payload)`和`mutate(ownerInstanceId,action,payload,expectedRevision,authorize)`由所属应用执行。Host从已登记深度view解析消费app/instance，读取其当前资源引用，再解析owner，HTTP数据请求禁止指定任意instanceId/ownerInstanceId/appId。无共享引用时只能访问消费实例自己所属应用的数据；其他新实例不继承引用或授权。viewId是可信插件的上下文身份，不是秘密凭证；同源Operator管理接口不是多租户安全隔离，也不防御恶意可信同源插件。

管理HTTP `/api/worktable/resources`只接受认证同源POST JSON（16KiB上限）。`operation`为：

- `snapshot`：读取当前profile引用配置。
- `share`：`ownerViewId, consumerInstanceId, resourceId`，显式创建默认`['read']`引用，检查真实深度实例和资源贡献。忽略客户端夹带的写权限，不继承来源实例角色或会话。
- `permissions`：`id,revision,allowedActions`，保留read，只允许所属应用声明的有限动作，乐观检查配置revision。
- `revoke`：`id,revision`，保存撤销状态并递增revision；保存失败不宣布成功。重启仍拒绝访问。重新共享产生新引用ID，旧写请求不会复活。
- `call`：`viewId,resourceId,action,payload,expectedRevision,expectedConnectionRevision`。返回`{value,connection,committed}`。共享写必须携带当前connection revision；业务revision由owner验证。自有资源没有connection。

Operator准入和实例授权分开。普通网页既不能使用非深度view，也不能绕开同源准入；本工单没有增加网页桥接、原生上下文或凭据传递。

## 撤销与提交边界

读取开始捕获引用和handler，返回前复验引用ID/revision与handler；撤销或来源/权限改变使迟到读取拒绝，消费UI清空记录。写入owner串行队列内先校验业务revision和authorize；真正开始业务table.put前再次authorize。撤销完成后才到此检查的排队写会失败。

已通过最后授权检查并开始持久写的操作可能在撤销后完成，不承诺撤回或回滚。成功后Host再检查权限；若权限仍有效，返回已提交结果；若期间撤销、换引用或owner退出，返回`committed:true,value:null,notice:'写入已提交…'`，不泄露迟到资料，也不把已提交写伪报为未提交/可自动重试。客户端显示明确已提交信息并重新读取；不会静默重试覆盖。

## 阅读应用与兼容

阅读保留原`reading_statistics` domain/version1和业务行原字段（instanceId/initialized/records），不迁移、清空、倒灌或给旧strict业务schema加字段。独立`reading_statistics_revisions` v1保存每实例计数；响应revision为计数加当前业务行SHA-256。先持久计数再写业务行；元数据失败阻止业务写，业务失败最多使旧编辑版本失效，不覆盖原记录。旧产品更新业务行后摘要变化，重装新版可拒绝旧草稿。官方domain行为测试实际关闭新owner、按原v1 strict schema打开/写入并重新打开新owner，证明行可读与冲突检查；这不是完整09产品回退实机验收。

旧`/api/reading-statistics/data`任意实例ID HTTP入口明确403；保留认证/JSON/体积/形状检查，但不保留授权旁路。旧recipe前台兼容API在本版不可继续读写；旧记录与default等实例ID保留。原historical reading-platform/deep-views夹具仍留存，其任意ID成功预期不适用于05，未删除或伪装通过；09必须核对Worktable/阅读版本配对。新Worktable深度路径不加载旧personal-workbench前台。

阅读完整页折叠“资料共享”，选择目标实例→确认只读共享→单独允许新增/编辑/删除→撤销共享；消费页显示只读/错误状态。列表、统计、详情沿同一消费实例state；展示偏好以consumer+connection ID隔离，不用owner ID合并不同实例。页面“刷新资料与权限”和“刷新共享状态”读Host当前状态；单浏览器JS内写入/管理通知已挂载阅读实例，跨窗口或重启后需要显式刷新，不宣称实时Host推送。编辑开始时固定业务和引用版本，后台刷新不把旧表单升级为可覆盖新记录的版本。

## 辅助证据与待验

- `worktable/04_test/data-grants.test.mjs`：默认只读、单实例授权/C独立、持久撤销、迟到读、owner撤销、通用append-note动作及在飞写提交状态。
- `data-grants-http.test.mjs`：Operator拒绝、任意owner/instance夹带拒绝、普通网页拒绝、share不可夹带写许可。
- `reading-statistics/tests/data-grants.test.mjs`：官方JSON/domain owner真实写入、业务冲突、A→B只引用不复制、排队撤销、重启配置、原业务schema/旧写兼容。
- `data-grants-ui.test.mjs`：真实阅读React组件+官方domain+公开目录/资源seam完成A/B/C共享/写入/过滤隔离/撤销；是辅助DOM证据，不替代最终包真实浏览器流程。

真实安装由root独占Host/浏览器执行：A录入/示例→B/C空→A共享B→B只读、C空→HTTP未授权写拒绝→A授予B编辑→B保存后A更新、B自有库仍空→撤销后B记录清空且后续读写失败→刷新及Host重启后复验。已进入原生AI的历史不删除；本工单不发送AI、不扩展原生执行。

## 首个候选本地产物检查（辅助，非真实UI验收）

2026-10-19，独立05工作树。`npm run pack`唯一Worktable入口通过120项源契约（含05 HTTP/授权/竞态）、构建/语法、精确7文件、独立临时npm安装/服务端import、客户端工厂、安装产物8项锚点与3组home回归。双资产SHA-256均为`e2eee4ebfb2c84760ab30658764e8754efc04e7254e1ba420df4a6cde2b80d7c`。

阅读`check-types.mjs`通过（DSH_SOURCE指向官方已构建runtime；READING_LEGACY_ROOT指向已有legacy声明的checkout，仅使用类型，不加载前台）。`tsx --test tests/data-grants.test.mjs tests/data-grants-ui.test.mjs`共5项通过。tsdown实际构建并npm pack后tar清单精确6文件：README.md、cordis.patch.yml、package.json、lib/client.js、lib/index.js、lib/reading-host-4C2dNE-n.mjs。没有src或map。固定/版本化阅读tgz同SHA-256：`e3a6d3a1dff5159ccb5e4f934f999dddf8c1d3eb26aeb781de5b42fb9c2f222c`。独立临时npm安装（ignore-scripts、omit optional、legacy-peer-deps并显式安装已测zod4.4.3）后import与实际client factory/深度视图注册通过；storage-domain声明仍精确`0.2.0-rc.2`。这不代替官方profile实际加载可选storage依赖，或旧版个人工作台端到端兼容证明。

未改原生/3080/原Worktable，未启动任何Host或浏览器、未安装到用户profile、未发送原生会话。生成包保留在本工作树各插件dist内，交root最终真实安装验收。05状态仍在实施中。


## 独立复审与可读目标补丁候选

root实际安装首个候选后反馈：共享目标不应显示内部layout UUID。此补丁以目录内真实projectId相等关系仅生成“同项目 / 其他项目 / 未归属 · 实例短ID”，不从目录推身份，也不传native Context；真实授权仍使用原稳定实例ID。UI测试包含相同项目、其他项目、未归属目标并断言可读选项。

独立复审复现owner重载撤回动作后旧grant仍可调用的漏洞；公开ResourceDirectory测试先RED，再将共享路径也逐次校验当前handler.actions后GREEN，撤回动作不会进入mutate。旧持久授权不是owner新版本动作声明的替代。

复审也发现共享管理晚失败/初始化晚失败可能污染已切换视图。实际React测试先分别复现RED：A的延迟共享失败进入D页面；D页面已切换而同实例stats还存活时，旧初始化失败把stats标错。Sharing管理/加载现在携带当前instance+view生命周期token和AbortSignal，释放后不setState/notify；初始化catch同时检查来源view生命周期与数据generation。两项均GREEN，读取与旧实例状态不串。只对05四个新增mjs文件归一LF，避免新blob中的CRLF被diff --check判尾随空白，不变更全局属性。

本补丁Worktable唯一npm run pack通过121项源测试、精确7文件、独立安装/import/factory及安装产物8锚点/3组home。当前固定/版本化双资产SHA-256均为`ea2cb32e22953a90595d751cf18281a91a5ca44115578e15fa3ea3eb14c674fd`。阅读当前5项测试（扩展UI场景）、check-types、tsdown、精确6文件、独立安装/import/factory通过；当前阅读双资产SHA-256均为`07e6193925911a177f03e9bbb6367375f77383ea6f6af09bfb7fefc2d1d90c10`。业务owner chunk仍为reading-host-4C2dNE-n.mjs，storage-domain仍精确官方0.2.0-rc.2。

此处只记录辅助补丁结果；root继续用新候选实际浏览器复验目标选择、写入和撤销，05未因此关单。
