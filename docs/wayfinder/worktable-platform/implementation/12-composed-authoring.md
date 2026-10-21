---
id: worktable-framework-12
title: 组合应用草稿、预览与显式启用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: continuation_authoring
blocked_by: []
---

# 12: 组合应用草稿、预览与显式启用

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

通过公开Host合同持久化组合应用草稿与运行版本；校验模板/页面/模块/数据引用/可选角色，乐观并发和版本递增；预览无运行替换和发送副作用；启用通过现有应用注册、实例和视图模型承载，重启后恢复。独立应用仍保持自有协议，不导入旧前台。

## Acceptance

- [x] 公开草稿生命周期及应用/实例注册合同；实际保存/预览/启用/再次编辑，验证运行版隔离与实例/历史保持。
- [x] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [x] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [x] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。

## 2026-10-21源码实施（未关闭）

- 公共合同见[authoring合同](12-authoring-contract.md)，新增`worktableCompositions`及认证HTTP；草稿/运行同一原子所有者，schema3拒绝旧Host静默读取；普通独立应用/原实例/原生角色绑定保持。
- TDD首接缝：`node --test plugins/worktable/04_test/compositions.test.mjs`。第一次RED为缺少CompositionDirectory模块；最小实现后首个save/preview/activate/冷恢复场景GREEN。第二轮RED为首页id被替换仍可激活（Missing expected rejection），最小身份保护后GREEN。
- 新增5项生命周期测试+1项真实注册HTTP处理器测试；补验真实profile路径故障、所有者冲突、依赖失效、版本冲突、预览不建原生会话和更新保留角色绑定。连同既有application-entry/application-http/roles/role-lifecycle/resources回归最终28项通过，零skip。native authority测试替身仅属原生边界辅助，不能替代模型执行。
- 首次完整build因新工作树缺xterm/markdown-it/highlight.js失败；按原锁`npm ci --ignore-scripts --no-audit --no-fund`补19项依赖后，`npm run build`和`npm run check`均通过。未改manifest/锁、未pack、未覆盖冻结0.7.2发布资产。
- 仍须root在最终发布版本的隔离官方DSH实际安装后验证Host生命周期。14补实际模块内交互，19补全链证据；本条源码/HTTP夹具结果不等同安装闭环，工单保持open。原生/上游/3080和资料未改。

- SDK补验：公开describeProtocol/requireProtocol消费者要求composed-authoring-v1先RED（明确缺少该feature），sdk.mjs最小追加可选feature后GREEN；组合生命周期/HTTP/SDK共8项通过。保留协议1与其他feature，不声称尚未安装的运行结果。

## 2026-10-21最终Host安装验收与关闭边界

[精确安装及冷恢复证据](evidence/12-installed.json)：隔离3091，官方未补丁DSH0.2.0-rc.2，Worktable0.8.0归档SHA256 c4fb81aa00de16390ed11eeadd7c0e0e5425bf48f0bfcbb156c4e066e8096a91，Notes/Reading0.2.0。root实际认证HTTP完成保存不发布、预览无新实例、旧revision拒绝、显式启用、未升版本拒绝、再次启用身份保持、缺失源拒绝7步。初始13实例/23视图，明确验收setup后14实例/24视图；不将setup计为无新增。

官方Host重启PID27528后，实施者只用GET health/applications/compositions复验：同一app的running1.1.0，draft1.1.0、revision7，原实例4627e87f-e4ff-412a-a60c-faa84dd8b925和视图07a45ebb-fc1a-4b62-97c0-16b9da531e14保持；只读复验前后全部Session文件清单hash和roles/tasks文件hash相同。未新增实例、授权、会话或模型发送。

12关闭仅表示真实安装Host草稿/预览/启用及冷恢复合同通过。模块内编辑、模板复制、公共展示实际操作归14，AI生成追改归15，全链验收归19，均不可继承这份HTTP验收。完整framework spec继续open，考公暂停；未修改3080和原生/上游。

关闭前保护guard在集成daed17d通过：原生/上游无变更、六份历史用户文件hash保持、集成index干净。本候选仅更新12票/12合同/本证据/README对应行，未重写01—11不可变证据。

## 2026-10-21环境归因补正（保留原证据）

上述PID27528的官方rc.2仅准确描述启动器/原生源码版本。后续依赖检查发现独立profile的插件fallback实际解析webserver/storage alpha.2且缺invariants，原12-installed.json属于混合依赖环境，不能继续作为全rc.2依赖环境证明。原证据不改写，SHA256仍为23a2d3fbe53905205034f5c840c2317da665fadefe248f1c6748cbaafb24ccdc。

root在隔离profile通过正常pnpm安装公开exact Cordis4.0.4、Schemastery3.18.4、invariants/storage/webserver/storage-domain0.2.0-rc.2，公开peer检查0问题并冷启PID9032。未改原生源码或冻结Worktable0.8.0归档；三包实际依赖realpath核对由13记录。

[补充实测](evidence/12-clean-installed.json)分开记录：①修正依赖后新target acceptance-composed-1792592058543再次完成7步Host生命周期（16→17实例、26→27视图）；该target是在PID9032启动后建立，尚未再次冷启，coldRecoveryPending仍true。②实施者只GET compositions/applications确认原target acceptance-composed-1792589152356在修正profile冷启后仍running1.1.0/draft1.1.0、revision7，同instance4627e87f-e4ff-412a-a60c-faa84dd8b925和view07a45ebb-fc1a-4b62-97c0-16b9da531e14；未重新setup、未发模型。

两组分别证明clean环境7步与已有状态在clean冷启后保持；不把新target说成已再次冷启。16正在并行执行模型任务，此补验不比较或声称整个profile、任务、Session文件无变化。12Host关闭保持，14/19UI与完整spec仍未验，不扩大原证据范围。
