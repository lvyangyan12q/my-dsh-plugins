---
id: worktable-framework-13
title: 公共展示组件与可选主题
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_presentation
blocked_by: []
---

# 13: 公共展示组件与可选主题

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

提供可选统计卡片、列表、详情、筛选和空/错/加载态及明确字段映射，保持browser-safe SDK与唯一打包门禁。展示数据由调用者提供；以Reading和Notes两个独立消费者证明不需平台业务特判；不全局改原生/网页CSS。

## Acceptance

- [ ] 公开展示入口与真实挂载控件，字段缺失/筛选/选中/主题/窄屏行为；两个应用接入，SDK独立消费者及精确归档。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。


## 实施检查点（候选，未关闭）

公开入口选用`createPresentation(React)`而非新增React静态依赖子路径，保持SDK服务端安全与9文件门禁。接口见[SDK候选补充](10-sdk-contract.md#13后续候选可选公共展示尚待实际安装验收)。Reading与Notes只从公开SDK导入；应用数据、角色、持久化和授权保持各自owner。

TDD公开接缝：`04_test/presentation.test.mjs`通过真实ReactDOM挂载/点击选择和select change观察结果。首轮RED为公开createPresentation缺导出；第一片GREEN为字段映射、求和、选择回调与详情缺失字段。第二个RED为未知median聚合仍显示可信数值，GREEN改为明确配置错误。辅助覆盖加载/空/错误不暴露旧资料、重试、有限数字、受控筛选与局部主题。真实窄屏几何、两应用最终安装/精确归档仍交root验收，不以jsdom通过宣称完成。


### 后续19须迁移的Reading旧回归入口

`plugins/reading-statistics/tests/deep-views.test.mjs`仍直接对旧`installReading.handle`发送任意`instanceId`，并由`requestReading`缺少`viewId`读取。生产早已拒绝这条路径，因此其403是旧夹具未迁移，不能记为通过或用放宽生产授权修测试。19应沿当前`data-grants-ui.test.mjs`：官方StorageDomain注册Reading ResourceOwner，公开ApplicationDirectory登记应用/实例/视图，ResourceDirectory.call接收`{operation:'call',viewId,resourceId:'reading-records',action,payload,expectedRevision}`，响应`value/connection`；挂载的Props须传实际登记view.id。初始化与mutation从该视图解析owner实例，测试跨实例拒绝、同实例筛选/选择、偏好恢复及迟到响应。公共服务fixture须提供真实describe协议；VM/DOM保持同一React依赖副本。仅迁移辅助夹具，不另开任意ID接口、不预填旧资料。

当前与此变更相关的`data-grants-ui.test.mjs`真实Host+资源四实例DOM已通过；旧deep-views尚未迁移，明确未计通过。最终候选统一Worktable0.8.0、Notes0.2.0、Reading0.2.0；首阶段0.7.2/0.1.2归档不变。


### Notes正式producer门禁修正（0.2.0候选）

先前工作树的普通tsc成功隐式解析上级Cordis4.0.5-alpha.1与Skill0.2.1-alpha.2；运行夹具的DSH_SOURCE=rc.2不控制TypeScript解析，因此不作为独立rc.2类型证明。正式producer现在从确切WORKTABLE_PACKAGE归档正常安装SDK，并显式传入已构建DSH_SOURCE的公共Cordis4.0.4、Schemastery3.18.4及locale/webserver/storage-domain/skill0.2.0-rc.2包，避免可选`*`回落旧registry locale。未使用force、legacy-peer-deps、旧前台声明或src路径别名。

公开`check-types.mjs`在系统临时目录复制应用源码、安装公开依赖并同时检查源码与SDK消费者合同，显式关闭skipLibCheck；SDK/Cordis/Skill/工具链realpath与version、归档SHA记录到receipt。SDK必须真实位于临时node_modules；应用、SDK和Skill解析到同一个已选官方Cordis身份。Notes声明此前缺失的官方Skill开发依赖；运行仍仅在skills服务可用时贡献能力。unique pack的独立归档consumer沿用同一显式公开peer安装策略，并把producer与consumer身份纳入release receipt。

TDD新增公开producer命令回归：旧check-types仅退出0却无依赖身份receipt而RED；隔离确切SDK+公开peers、严格源码/合同检查后GREEN。未改冻结Worktable0.8.0归档，Notes仍待实际最终包/宿主验收。


本次候选unique pack已跑通19/19零skip、严格producer/consumer、5文件逐字节、Host import与最终client factory，记录见[evidence/13-notes-public-producer.json](evidence/13-notes-public-producer.json)。Notes0.2.0候选SHA `375f1ef756e5da976de2c8286f3dd6d59ad3059fcba41dcd0df242ed05cab17e`；所用冻结Worktable0.8.0 SHA `c4fb81aa00de16390ed11eeadd7c0e0e5425bf48f0bfcbb156c4e066e8096a91`。未提供旧不兼容归档变量，该附加分支未计通过；没有据此关闭13或宣称真实宿主/模型验收。
