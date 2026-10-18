---
id: worktable-framework-11
title: 首阶段完整验收与渐进迁移清单
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-09, worktable-framework-10]
---

# 11: 首阶段完整验收与渐进迁移清单

**What to build:** 在精确记录的官方安装组合上完成已确认F01-F08及F10-F13首阶段用户流程，不用测试夹具代替真实网页和深度应用。

**Blocked by:** [停用、升级与回退的数据保护](09-lifecycle.md)、[第二应用独立接入并冻结首版协议](10-protocol.md)。

**Status:** ready-for-agent

- [ ] 在精确记录的官方安装组合上完成已确认F01-F08及F10-F13首阶段用户流程，不用测试夹具代替真实网页和深度应用。
- [ ] 完成桌面/窄屏、键盘、焦点、滚动、主题及原生菜单检查；普通网页未经授权不能取得平台能力。
- [ ] 逐项映射原123条要求和本规格49条用户故事为首阶段已验、当前未验或后续保留，不删旧需求或假关旧工单。
- [ ] 完整搭建器、高级网页桥接、自动追改继续列后续，首阶段通过不等于完整规格完成。
- [ ] 记录未决兼容/原生能力限制、保护校验和回退指引；按固定基线进行Standards与Spec两轴审查并修复发现。
- [ ] 只有实际证据齐全才关闭本阶段工单；正式3080、原生运行目录切换和远程发布不作为本工单的默示动作。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
