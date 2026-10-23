---
id: worktable-framework-17
title: 显式受控网页桥接
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [worktable-framework-14, worktable-framework-16]
---

# 17: 显式受控网页桥接

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## 当前验收 · 2026-10-22

本票按显式合作网页有限桥接范围关闭，安装证据见[evidence/17-installed.json](evidence/17-installed.json)。独立官方未补丁DSH0.2.0-rc.2、Worktable0.9.3及冻结包SHA256 `57222fda4d6f4b9310e42baa2c1648372f5ea26a2dc2ae9f049a9497b15abd5b`，最终9/9安装文件与归档逐字节一致；不把历史0.9.0冒称已有该9文件核对。19进入可领取前沿，完整spec仍open。以下“源码候选/保持open”段落为各版本当时记录，不覆盖本节。

## What to build

提供opt-in有限桥接，仅授予所选只读资源和准备任务；校验精确来源、source窗口、视图/实例与代际、请求关联和授权，撤销/卸载/迟到响应拒绝。普通网页继续sandbox/no-referrer无能力，桥接不能直接发模型或调用任意原生工具。

## Acceptance

- [x] F14真实网页与平台交互、错误来源/窗口/实例、撤销与旧请求拒绝；不把纯消息fixture替代实际网页。
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [x] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [14](14-inline-builder.md)
- [16](16-failure-states.md)

## 2026-10-22源码候选（保持open）

已新增公开WebBridgeDirectory、认证有限API、合作网页wrapper/实际CSP正反probe和模块内显式开关。仅组合deep的网站模块可接入；独立web和普通网页无能力。受控站点要求不同cookie hostname与接受强制嵌入CSP，不能只比较origin或给普通iframe加allow-same-origin。只读consumer授权、角色绑定、模块/运行版本/lifecycle、唯一请求/代际以及卸载后晚响应复验。prepare与revoke同AdmissionGate；来源持久source.web，不增原生发送通道、自动Stop或自动提交。

源码辅助证据见[evidence/17-source.json](evidence/17-source.json)。真实Chrome纯合成双站点验证了后代漏洞RED→GREEN、普通/受限CSP双probe、无opt-in拒绝、302/self-navigation、Worker/Object以及cookie主机布尔正反对照；仅为隔离辅助，不是安装DSH的F14。独立合作站点的复验入口见插件04_test/fixtures/web-bridge/README.md。最终包/3091读取与准备、错误窗口/实例、撤销/关闭/重开、真实任务归属尚由root验证，未执行pack/install/restart/model/push，不关闭本票。

普通网页入口补充保护：真实Chrome的原opaque sandbox仍发送同hostname跨端口合成HttpOnly/SameSite=Strict Cookie。经root明确收窄，websiteEntry有Host origin时也拒同normalized hostname；公开注册/HTTP/旧URL实际renderer RED→GREEN，保留旧URL和资料，不自动改写。已保存127.0.0.1跨端口应用需显式改用localhost等独立hostname。辅助服务/标签和合成Cookie哨兵均已清理，3091/3080不动。

## 0.9.2 资料引用撤销补充（源码候选，保持open）

实际F14发现网站模块缺少资料引用撤销入口。现仅展开“网站能力”时查询当前消费视图、所选来源视图与resourceId的授权元数据；不调用全局snapshot、不读取业务资料。界面显示只读/未授权/已撤销/自有/其他来源状态，提供独立“撤销此实例资料引用”。撤销沿用既有revision控制及局部通知，不删已准备任务、不自动发送或Stop；其原生发送仍由既有资料grant复验拒绝。权限回执与模块代际及查询epoch绑定，替换模块的晚回执不可污染新视图；撤桥接先清理旧错误。须root安装0.9.2实际读→准备→界面撤资料→原生提交拒绝后补证，当前不关闭17。

源码复验：unique release source gate 260/260，零skip；build/check及实际构建client factory（real React、原external白名单）通过。新增Host受控元数据正反用例确认不调用Owner.read、不返回其他来源grant字段；React验证独立资料撤销和跨模块晚回执。此处仍为源码辅助，不替代0.9.2实际安装验收。

## F14 实际安装闭环与限制

root先在0.9.0通过默认无能力→显式只读新两条合成Notes→网页只准备任务（Owner引用、无native requestId），重复请求保持单行，错误实例/旧代际/submit/绕wrapper直发无新任务。090通过API撤资料只是历史辅助；发现缺UI后增加0.9.2并在最终0.9.3实页重做：明确授权引用、read/prepare、点击“撤销此实例资料引用”，界面显示已撤销；后续资料403、网页读取拒绝、TaskPanel确认发送明确拒绝，两个准备行及历史保留、requestId仍null。随后cap撤销清旧错误，不Stop/自动发送。

独立Chrome在新项目/新应用/新实例验证：同主机跨端口明确拒绝且无iframe；uncooperative缺Allow-CSP-From被Chrome阻止，超时关闭；redirect跳宿主被精确frame-src阻止，超时关闭；合作站点真实prepare-only握手后完整刷新、重开同实例，全部checkbox复位、无受控frame、普通sandbox恢复。新项目及首模块/角色由UI创建，另3个website模块仅通过本配方认证save追加，再UI显式启用；connections=[]，无业务数据/授权、无模型发送，自己任务始终[]。没有修改共享配方或其他agent实例。

只承诺组合deep模块中的合作网站有限协议，要求不同cookie hostname、Allow-CSP-From及实际CSP探测；独立web无能力，不承诺任意站点/跨浏览器。普通opaque sandbox原导航政策未升级为禁止redirect；受控导航拒绝证据不能用于该承诺。262/262源码、构建和实际client factory为辅助，与F14实页区分。原生/上游、六份历史用户改动、资料和历史、3080保持；19负责最终冷恢复/回退/目标alpha.2与两轴审查，历史172映射和考公暂停不变。
