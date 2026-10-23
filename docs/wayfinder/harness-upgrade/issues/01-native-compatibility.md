---
id: harness-upgrade-native-research
title: 核实 rc.3 公开接口与工作台依赖的差异
parent: harness-upgrade-map
labels: [wayfinder:research]
status: closed
assignee: null
blocked_by: []
context_branch: research/harness-rc3-compatibility-20261024
---

## Question

在固定原生 rc.3 与 Worktable 0.9.6 代码基线上，插件使用的配置、Host/Client 注册、会话/输入/原生执行、存储、生命周期和安装版本检查有哪些实际差异？哪些可由插件公开适配层修复，哪些须明确不可用或等待上游？Notes/Reading 这两个消费者需要随 SDK 验证什么？

研究须引用拥有接口的源码，区分声明不兼容、实际调用失配及尚未运行验证；给出适配接缝、版本/能力检查和建议验收矩阵。不要改产品代码、绕过版本检查、写原生补丁或把原生构建通过当作插件闭环。

## Resolution

只读研究完成，报告已审阅并发布到独立 research 分支：[Worktable 0.9.6 → Harness rc.3 公开接口研究](https://github.com/lvyangyan12q/my-dsh-plugins/blob/52757981818725d072e445523c670847511192c9/docs/wayfinder/harness-upgrade/research/harness-rc3-compatibility.md)。来源固定为产品 8b6fadd 与原生 22ddee；没有合并研究分支。

官方兼容纯函数实际放行 Worktable、拒绝 Notes/Reading 的旧 DSH peer 声明；该门禁不读取工作台自定义 dsh.compatibility。源码确认角色恢复仍调用已不存在的 inspect，输入坐标折算未覆盖 command/quote；还需处理 create 返回不同身份、迁移状态及旧 HTTP 路由释放。可继续评估公开 stat/projections、输入初始化等插件侧适配，不需要原生补丁。

研究关闭仅确认差异与接缝已查清；未运行修复、安装、浏览器或模型闭环，不表示 rc.3 适配通过。升级策略仍待用户决策。
