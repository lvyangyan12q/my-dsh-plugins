---
id: worktable-framework-17
title: 显式受控网页桥接
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-14, worktable-framework-16]
---

# 17: 显式受控网页桥接

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

提供opt-in有限桥接，仅授予所选只读资源和准备任务；校验精确来源、source窗口、视图/实例与代际、请求关联和授权，撤销/卸载/迟到响应拒绝。普通网页继续sandbox/no-referrer无能力，桥接不能直接发模型或调用任意原生工具。

## Acceptance

- [ ] F14真实网页与平台交互、错误来源/窗口/实例、撤销与旧请求拒绝；不把纯消息fixture替代实际网页。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [14](14-inline-builder.md)
- [16](16-failure-states.md)

## 2026-10-22源码候选（保持open）

已新增公开WebBridgeDirectory、认证有限API、合作网页wrapper/实际CSP正反probe和模块内显式开关。仅组合deep的网站模块可接入；独立web和普通网页无能力。受控站点要求不同cookie hostname与接受强制嵌入CSP，不能只比较origin或给普通iframe加allow-same-origin。只读consumer授权、角色绑定、模块/运行版本/lifecycle、唯一请求/代际以及卸载后晚响应复验。prepare与revoke同AdmissionGate；来源持久source.web，不增原生发送通道、自动Stop或自动提交。

源码辅助证据见[evidence/17-source.json](evidence/17-source.json)。真实Chrome纯合成双站点验证了后代漏洞RED→GREEN、普通/受限CSP双probe、无opt-in拒绝、302/self-navigation、Worker/Object以及cookie主机布尔正反对照；仅为隔离辅助，不是安装DSH的F14。独立合作站点的复验入口见插件04_test/fixtures/web-bridge/README.md。最终包/3091读取与准备、错误窗口/实例、撤销/关闭/重开、真实任务归属尚由root验证，未执行pack/install/restart/model/push，不关闭本票。

普通网页入口补充保护：真实Chrome的原opaque sandbox仍发送同hostname跨端口合成HttpOnly/SameSite=Strict Cookie。经root明确收窄，websiteEntry有Host origin时也拒同normalized hostname；公开注册/HTTP/旧URL实际renderer RED→GREEN，保留旧URL和资料，不自动改写。已保存127.0.0.1跨端口应用需显式改用localhost等独立hostname。辅助服务/标签和合成Cookie哨兵均已清理，3091/3080不动。
