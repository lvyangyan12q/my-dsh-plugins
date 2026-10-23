# 派生框架持久化与网页接入（工单03）

本文件只描述本地Worktable派生框架增量，不改写原始上游的历史PRD或验收声明。

## 数据归属

- 应用注册、实例、视图引用：Host profileContext.dir/worktable-platform/applications.v1.json，schema=1。profileContext来自官方Launcher公开服务，缺失时不猜全局目录。
- 项目布局、标签位置、展示偏好：继续使用既有浏览器localStorage键，不批量清空或迁移原数据；新增application内容只保存appId/instanceId/viewId/title引用。
- 业务资料和内部网页状态：仍由网页/应用所有；普通网页不声明跨视图同步。
- 原生会话、轨迹、审批和凭据：仍由DSH所有。网页接入不自动新建或重绑会话。

## 身份与操作

register校验稳定应用ID、协议版本和独立http/https入口。createInstance仅由显式新建触发。latest按应用和projectId（可null）恢复最近实例；没有实例时返回空而非偷偷创建。attach仅允许未归属→一个项目或同项目幂等，并校验revision。createView沿用实例；关闭、移动标签和渲染池淘汰都不拥有删实例权限。注销注册保留实例/视图，resolveView显示缺应用。

## 保存与恢复

每个当前Host服务串行写入；先临时文件后原子rename，成功后才返回保存结果。读取损坏、schema不兼容、写入失败均保留原文件并明确反馈。首阶段03只验证基本服务重建读取和profile隔离；跨进程并发/完整重启及迁移回退由08/09继续，不声称现已解决所有并发场景。

## 网页与权限

网页iframe使用scripts/forms/popups有限sandbox且不允许same-origin，不暴露原生桥。拒绝DSH同源、活动协议、URL凭据和token查询。敏感插件HTTP/WS接口必须先经原生connection.admit；只要宿主公开认证缺失就失败关闭，不以Origin隐藏代替权限。模板与健康接口为无私有内容公开读入口。既有可信生成产物保持旧渲染方式，不将其误称为不可信网页隔离。

普通iframe无法可靠探测所有CSP/XFO失败。界面保持外部打开、重试和加载边界说明，不以onLoad当业务成功，也不服务端代理抓取任意网页。高级网页桥接留后续。

## 明确恢复与异步归属

resume是显式使用动作，更新最近使用顺序而不新建实例/视图；latest、resolveView等查询保持只读。继续入口、组件首次挂载和缓存布局激活接入resume。容器标题固定为中性“应用视图”，归属由实例徽标展示。

应用组件按实例与视图稳定key挂载；每轮读取有独立AbortController和generation，动作只有解析身份匹配当前目标才开放。旧响应即使运输层忽略取消也不得覆盖新目标；新增视图/选择器回包需再次检查布局、窗格和原标签身份。组件回归使用真实React renderer断言可见网页和用户按钮目标；旧85140ab源码可复现失败，修复源码通过。实际Host浏览器验收仍由主任务继续记录。

## 14组合模块与实例展示状态（源码候选，正式安装验收待实施票）

组合配方草稿/运行定义仍使用applications.v1.json同一Host原子所有者（12引入schema3）。14在用户实际更改筛选/选中时增加presentationStates：{instanceId,revision,scopes:{[connectionId或moduleId]:{filters,selectedId}}}；首次写入后schema4，更新配方、停用和恢复均不得降回schema3。通过登记view推导实例，未知/移除scope拒绝新写；移除页面的旧视图显示不可用，不转到第N页。读取过滤掉已移除scope但保留耐久记录，关闭视图不删状态。旧0.8支持到schema3，遇4必须拒绝并保留原文件，不能倒灌旧profile。

布局仍只有原Worktable splitStore；窗格内组合renderer不调用父row/index改外层内容。模板复制去权限/角色/路径/原生会话等运行身份。来源元数据发现不授权，运行资源调用带consumer view并校验来源，显式read-share另走现有资源所有者；业务记录与原生Session仍由原owner管理。sameinstance两视图通过Host OCC和instance-scoped成功刷新通知共享状态；不承诺跨浏览器实时push。过滤草稿在卡片中显式应用，失败保留输入和旧运行状态。

原生对话模块仅展示/导航同角色Session，不挂第二composer。新custom产物由用户明确选择既有文件，经认证读后opaque sandbox srcDoc承载，未授权同origin/原生API；原legacy iframe不因此被重新宣称隔离。生成/追改15另需稳定归属与显式产物应用，不从本模块绕过任务准入。


### Candidate0.9.0：组合模块生成元数据

组合自定义模块的生成状态由profile下`worktable-platform/generations.v1.json`独立schema1 owner持久化；项目/实例/视图/页面/模块及draft revision/version/config fingerprint固定，不复用旧widget自动挂载状态。任务首次含受管preparation时，独立tasks.v1.json升sticky schema2，只有TaskStore接入1/2；旧角色/capability仍schema1。旧插件回退必须拒绝新版任务文件并保留字节，不能清空/降级/自动重发。生成目录由原生角色cwd明确批准，固定`.worktable-generated/<generationId>/result.json`及同目录HTML，路径realpath/大小/类型/hash围栏在预览和应用重验。只显式写draft，不自动activate或停止/删除原生会话；原生对应请求的aborted/未知结束不产生应用权。完整实际模型闭环待15最终验收，不将源码门禁当实页通过。


0.9.0候选修正：共享recipe仅存custom通用managedGeneration标记，不存原始路径/私有generationId/hash。AppStore的可选generatedBindings按instance/page/module持久化draft与active引用；保存草稿与该实例draft绑定同事务，带明确viewId启用与该实例active交换同事务。其他实例不继承/替换产物，准备/Stop/仅应用草稿保持旧active。应用schema3/4保留；旧0.8.4无raw path拒显，TaskStore2仍拒旧任务reader。


生成准备需携带当前describe返回的confirmationToken；它仅是目标/配方/角色绑定/Session/规范目录的乐观前置指纹，不是授权。确认后更换事实或角色不可用时，在mkdir和任务/ledger写入前拒绝，重新描述并显式确认后才能准备。


0.9.3生成清单首选schema2，仅身份和artifactPath，不填写sha256；Host预览从实际HTML字节算并锁hash，应用/展示继续核对HTML及清单字节。schema1仍验模型所给hash，schema2出现sha256拒绝。无需增加原生shell能力或用户手填hash。TaskPanel打开原生对话的异步返回不持续占任务busy，Stop仍可操作。


0.9.4平台generation ledger增加可选applyIntent（候选recipe/slot hash和OCC）与显式recovery审计。它不改变业务schema；旧applying无intent仅在原目标完整一致且不存在本generation的持久draft/active引用时可核实未提交。已提交但旧intent缺失时保守拒绝，不自动重放。恢复仅prepared或确认applied，原生请求/active产物保留，用户仍需分别预览、应用、启用。正式验收待root。
