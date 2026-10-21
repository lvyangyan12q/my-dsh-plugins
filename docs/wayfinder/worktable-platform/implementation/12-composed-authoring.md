---
id: worktable-framework-12
title: 组合应用草稿、预览与显式启用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_authoring
blocked_by: []
---

# 12: 组合应用草稿、预览与显式启用

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

通过公开Host合同持久化组合应用草稿与运行版本；校验模板/页面/模块/数据引用/可选角色，乐观并发和版本递增；预览无运行替换和发送副作用；启用通过现有应用注册、实例和视图模型承载，重启后恢复。独立应用仍保持自有协议，不导入旧前台。

## Acceptance

- [ ] 公开草稿生命周期及应用/实例注册合同；实际保存/预览/启用/再次编辑，验证运行版隔离与实例/历史保持。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。

## 2026-10-21源码实施（未关闭）

- 公共合同见[authoring合同](12-authoring-contract.md)，新增`worktableCompositions`及认证HTTP；草稿/运行同一原子所有者，schema3拒绝旧Host静默读取；普通独立应用/原实例/原生角色绑定保持。
- TDD首接缝：`node --test plugins/worktable/04_test/compositions.test.mjs`。第一次RED为缺少CompositionDirectory模块；最小实现后首个save/preview/activate/冷恢复场景GREEN。第二轮RED为首页id被替换仍可激活（Missing expected rejection），最小身份保护后GREEN。
- 新增5项生命周期测试+1项真实注册HTTP处理器测试；补验真实profile路径故障、所有者冲突、依赖失效、版本冲突、预览不建原生会话和更新保留角色绑定。连同既有application-entry/application-http/roles/role-lifecycle/resources回归最终28项通过，零skip。native authority测试替身仅属原生边界辅助，不能替代模型执行。
- 首次完整build因新工作树缺xterm/markdown-it/highlight.js失败；按原锁`npm ci --ignore-scripts --no-audit --no-fund`补19项依赖后，`npm run build`和`npm run check`均通过。未改manifest/锁、未pack、未覆盖冻结0.7.2发布资产。
- 仍须root在最终发布版本的隔离官方DSH实际安装后验证Host生命周期。14补实际模块内交互，19补全链证据；本条源码/HTTP夹具结果不等同安装闭环，工单保持open。原生/上游/3080和资料未改。

- SDK补验：公开describeProtocol/requireProtocol消费者要求composed-authoring-v1先RED（明确缺少该feature），sdk.mjs最小追加可选feature后GREEN；组合生命周期/HTTP/SDK共8项通过。保留协议1与其他feature，不声称尚未安装的运行结果。
