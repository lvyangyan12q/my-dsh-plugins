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
