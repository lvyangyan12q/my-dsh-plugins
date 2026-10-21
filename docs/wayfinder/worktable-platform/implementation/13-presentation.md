---
id: worktable-framework-13
title: 公共展示组件与可选主题
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: continuation_presentation
blocked_by: []
---

# 13: 公共展示组件与可选主题

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

提供可选统计卡片、列表、详情、筛选和空/错/加载态及明确字段映射，保持browser-safe SDK与唯一打包门禁。展示数据由调用者提供；以Reading和Notes两个独立消费者证明不需平台业务特判；不全局改原生/网页CSS。

## Acceptance

- [x] 公开展示入口与真实挂载控件，字段缺失/筛选/选中/主题/窄屏行为；两个应用接入，SDK独立消费者及精确归档。
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [x] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。


## 实施检查点（历史候选）

公开入口选用`createPresentation(React)`而非新增React静态依赖子路径，保持SDK服务端安全与9文件门禁。接口见[SDK候选补充](10-sdk-contract.md#13后续候选可选公共展示尚待实际安装验收)。Reading与Notes只从公开SDK导入；应用数据、角色、持久化和授权保持各自owner。

TDD公开接缝：`04_test/presentation.test.mjs`通过真实ReactDOM挂载/点击选择和select change观察结果。首轮RED为公开createPresentation缺导出；第一片GREEN为字段映射、求和、选择回调与详情缺失字段。第二个RED为未知median聚合仍显示可信数值，GREEN改为明确配置错误。辅助覆盖加载/空/错误不暴露旧资料、重试、有限数字、受控筛选与局部主题。真实窄屏几何、两应用最终安装/精确归档仍交root验收，不以jsdom通过宣称完成。


### 后续19须迁移的Reading旧回归入口（历史发现，已解决）

2026-10-21补充：`946498b`已将旧deep-views夹具迁往真实公开ResourceDirectory/已登记viewId；deep-views、data-grants-ui及实际tsdown工厂合计9/9零skip通过。SDK helper已内联，最终归档实际装3091，root实页筛选/详情/撤销已观察。下文保留发现时的原因与迁移方案，不再作为待19处理的未完成项，详见[evidence/13-reading-bundle.json](evidence/13-reading-bundle.json)。

`plugins/reading-statistics/tests/deep-views.test.mjs`仍直接对旧`installReading.handle`发送任意`instanceId`，并由`requestReading`缺少`viewId`读取。生产早已拒绝这条路径，因此其403是旧夹具未迁移，不能记为通过或用放宽生产授权修测试。19应沿当前`data-grants-ui.test.mjs`：官方StorageDomain注册Reading ResourceOwner，公开ApplicationDirectory登记应用/实例/视图，ResourceDirectory.call接收`{operation:'call',viewId,resourceId:'reading-records',action,payload,expectedRevision}`，响应`value/connection`；挂载的Props须传实际登记view.id。初始化与mutation从该视图解析owner实例，测试跨实例拒绝、同实例筛选/选择、偏好恢复及迟到响应。公共服务fixture须提供真实describe协议；VM/DOM保持同一React依赖副本。仅迁移辅助夹具，不另开任意ID接口、不预填旧资料。

当前与此变更相关的`data-grants-ui.test.mjs`真实Host+资源四实例DOM已通过；旧deep-views尚未迁移，明确未计通过。最终候选统一Worktable0.8.0、Notes0.2.0、Reading0.2.0；首阶段0.7.2/0.1.2归档不变。


### Notes正式producer门禁修正（0.2.0候选）

先前工作树的普通tsc成功隐式解析上级Cordis4.0.5-alpha.1与Skill0.2.1-alpha.2；运行夹具的DSH_SOURCE=rc.2不控制TypeScript解析，因此不作为独立rc.2类型证明。正式producer现在从确切WORKTABLE_PACKAGE归档正常安装SDK，并显式传入已构建DSH_SOURCE的公共Cordis4.0.4、Schemastery3.18.4及locale/webserver/storage-domain/skill0.2.0-rc.2包，避免可选`*`回落旧registry locale。未使用force、legacy-peer-deps、旧前台声明或src路径别名。

公开`check-types.mjs`在系统临时目录复制应用源码、安装公开依赖并同时检查源码与SDK消费者合同，显式关闭skipLibCheck；SDK/Cordis/Skill/工具链realpath与version、归档SHA记录到receipt。SDK必须真实位于临时node_modules；应用、SDK和Skill解析到同一个已选官方Cordis身份。Notes声明此前缺失的官方Skill开发依赖；运行仍仅在skills服务可用时贡献能力。unique pack的独立归档consumer沿用同一显式公开peer安装策略，并把producer与consumer身份纳入release receipt。

TDD新增公开producer命令回归：旧check-types仅退出0却无依赖身份receipt而RED；隔离确切SDK+公开peers、严格源码/合同检查后GREEN。未改冻结Worktable0.8.0归档，Notes仍待实际最终包/宿主验收。


本次候选unique pack已跑通19/19零skip、严格producer/consumer、5文件逐字节、Host import与最终client factory，记录见[evidence/13-notes-public-producer.json](evidence/13-notes-public-producer.json)。Notes0.2.0候选SHA `375f1ef756e5da976de2c8286f3dd6d59ad3059fcba41dcd0df242ed05cab17e`；所用冻结Worktable0.8.0 SHA `c4fb81aa00de16390ed11eeadd7c0e0e5425bf48f0bfcbb156c4e066e8096a91`。未提供旧不兼容归档变量，该附加分支未计通过；没有据此关闭13或宣称真实宿主/模型验收。


### 13实际安装检查点：依赖混合，暂不关闭（历史失败，后续已修复）

Worktable0.8.0/Notes0.2.0/Reading0.2.0已经正式装入独立3091，归档9/5/6文件与实际安装逐字节相同。Chrome真实Notes桌面、390×844明暗/筛选/选择/空态与root IAB两应用正常、撤销观测已记录在[evidence/13-installed.json](evidence/13-installed.json)，截图留C验收目录，二进制不加入仓库。Chrome与IAB是不同浏览器上下文，实例、观察者和范围分别记载；Reading拖窄未成功，不计390验收。

同版本owned pnpm11.28.5的只读`peers check`退出1：缺Cordis、invariants、storage、webserver。实际解析Cordis4.0.4/StorageDomain rc2，但storage/webserver向上回落原生alpha.2，invariants找不到。官方native preflight及插件页未报声明范围不兼容不能代替这项实际依赖核验。该receipt标记`mixed-deps-awaiting-reverify`，13保持open；root接手以明确官方公开rc2依赖修复ownedprofile，再做解析/peer/冷启实页复验。没有修改原生源码、冻结归档或放宽安装安全。


## 最终实际安装验收（2026-10-21，限定范围关闭13）

root正常安装明确公开rc2依赖并冷启PID9032后，独立复核owned pnpm11.28.5 `peers check`为0/No peer dependency issues found；从三插件及StorageDomain解析均是ownedprofile内Cordis4.0.4及rc2公共包，不再回落alpha或缺包。9/5/6文件与三份已冻结归档再次逐字节一致，未重打或覆盖归档。此前混合依赖失败[evidence/13-installed.json](evidence/13-installed.json)保留，不算成功；终态见[evidence/13-clean-installed.json](evidence/13-clean-installed.json)。

clean环境Chrome通过公共目录恢复原N3两条Notes，1440×900与390×844实页明暗、字段/筛选/选择/原正文、匹配为空无旧详情、局部滚动/无水平溢出、resize焦点保持通过。root在自己IAB真实复验Reading冷恢复、4/108→书籍乙1/50→原作者/缺笔记“未提供”，并复验既有撤销后的Reading、Notes完整页与摘要，刷新仍拒绝，未以成功0统计掩盖错误，旧字段/AI准备禁用。两浏览器与观察者分开记载；未创建grant、写业务或发送模型。四份clean截图保存在C验收目录并记录hash/尺寸，二进制不入仓。

公开factory可选Surface显式主题属于真实ReactDOM公共组件辅助覆盖，实际应用沿原生继承主题；Notes390证明窄屏公共展示，不宣称Reading拖窄成功或所有设备/主题。独立SDK producer/consumer、实际归档和两个应用实际UI共同支撑本票关闭；搭建器/模板交互仍归14，完整framework spec继续open。Reading旧403夹具已由946498b迁移9/9，不再是19的未完成事项。
