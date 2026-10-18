---
id: worktable-framework-04
title: 深度应用接入与同实例多视图
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: reading_deep_application
blocked_by: [worktable-framework-03]
---

# 04: 深度应用接入与同实例多视图

**What to build:** 一个真实深度应用能提供完整页面和可嵌入模块，通过统一注册进入已有项目；无需加载旧工作台前台。

**Blocked by:** [网页应用与未归属实例接入](03-web-entry.md)。

**Status:** in-progress

- [ ] 一个真实深度应用能提供完整页面和可嵌入模块，通过统一注册进入已有项目；无需加载旧工作台前台。
- [ ] 同实例两个视图共享已声明的工作状态；移动标签、改变窗格或重复打开不新建实例和会话。
- [ ] 跨项目及显式新建实例拥有独立状态，实例上下文不由当前全局会话、目录或窗格序号推导。
- [ ] 视图关闭、池淘汰和重新挂载不删除实例状态；已有实例可恢复，所有订阅有明确释放行为。
- [ ] 保持单一布局所有者；同会话编辑器归属明确，不能通过重复Session规避冲突。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。


## 2026-10-19 实施候选（待真实UI验收）

公开深度贡献、阅读自有完整页/统计/列表、同实例共享状态和生命周期已实现；最终平台`npm run pack`115项及产物门禁通过，阅读新旧18项与类型/构建通过。预审发现的并发登记P1已公开行为RED→GREEN修复，并耐久预留深度身份，避免撤销/重启后同ID变网页。详见[最小深度协议](04-deep-protocol.md)与[机器证据](evidence/04-deep-views.json)。

本工单保持in-progress，以上复选框待root对最终两包在3091的真实完整用户流程确认后才勾选；候选测试不替代安装UI验收，05/06/07/08及正式发布身份不在本次结论内。

真实安装暴露旧阅读候选的native依赖范围会被标准npm解析为alpha2，使rc2默认存储及原生投影服务不可用。已将storage-domain与host-webserver精确锁定已测rc2，并补实际tgz解包清单的npm标准选择RED→GREEN回归；新阅读SHA及旧候选失败记录保留于机器证据。原生源码和业务数据未由本实施任务修改，最终候选仍待root官方CLI重装及真实UI确认。

真实UI已观察A实例2条记录/75分钟与同实例统计、列表筛选共享，显式B为空；但旧候选缺少从B选择旧A的入口。已增当前app+project作用域的折叠“其他实例”，真实React连公开Host验证A→显式B→恢复A原view，不新增A或会话。应用容器按钮/表单已改官方实际主题token，修复亮色黑字深底；两项最终目验仍由root使用新07f1…平台包执行。新增applicationViews.tsx已转LF，全分支diff --check通过。
