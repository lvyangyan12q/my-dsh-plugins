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
