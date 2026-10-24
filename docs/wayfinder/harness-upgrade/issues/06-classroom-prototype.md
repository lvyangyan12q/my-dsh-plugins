---
id: harness-upgrade-classroom-prototype
title: 验证考公课堂原生对话的公开嵌入交互
parent: harness-upgrade-map
labels: [wayfinder:prototype]
status: closed
assignee: null
blocked_by: [harness-upgrade-support-policy, harness-upgrade-kaogong-ownership]
context_branch: codex/prototype-rc3-classroom
context_commit: 12250d9bd044a84bc9169d56abfcbf19d189f1b1
resolution_status: confirmed
---

## Question

在已确定的新宿主策略、学习实例和历史角色身份之上，用最小可丢弃原型验证：课堂内如何通过公开接口承载同一原生 Session，使讲义/练习与原生对话、轨迹、问题/审批、Stop 连续可用，同时维持唯一输入区、焦点、滚动和挂载释放？

沿用已确认的课堂与工作台布局，不重新选择工作台定位或改原生菜单。研究已确认当前应用 SDK 没有提供旧课堂使用的原生工厂上下文；需探索插件侧可公开的接入方式。若必须改变用户原有操作路径，应明确展示差异并由用户决定，不由研究者默认为等价。原型只用于判断交互与接入可行性，不等于正式适配或验收。

研究上下文见[考公迁移接缝报告](https://github.com/lvyangyan12q/my-dsh-plugins/blob/fc2614973552ad5db6178d03f791f4e27cf739b5/docs/wayfinder/harness-upgrade/research/kaogong-worktable-migration.md#sdk-已承接与仍缺的逐项映射)。仅在本票被领取时启动 prototype 工作；本轮未创建原型或操作用户实例。


## 实施上下文

本票已在 codex/prototype-rc3-classroom 独立分支领取；原型代码保持可丢弃，不合并集成分支。当前目标是原布局下真实原生公开接缝可用性，不重新选择视觉方案。


## 技术原型结果与待确认交互 · 2026-10-24

可丢弃分支提交12250d9已在未经补丁的真实rc.3独立3098运行，未发送模型消息。公开roles.ensure/open能够保持左侧模块挂载、页面和滚动，右侧使用同一原生Session；老师与班主任草稿隔离；关闭重开保留实例/视图及原生会话。应用不接收原生Context或rendererfactory。原型代码不合并生产，主线只记录结论和证据。

操作差异：旧课堂内部的对话容器改为Worktable已有右侧原生区，讲义/练习仍在左模块。这不是跳转后离开课堂，但不擅自认定等价。已给用户展示真实原型截图和3098页面，异步询问是否采用。答复前07生产课堂接入继续等待；05/06及08a可独立推进。

空会话没有轨迹标签，真实提问/审批/Stop未测试；不得把单输入区和挂载验证记为完整执行验收。完整模型流程继续属于10。

复现从该上下文提交读取 plugins/kaogong/prototype-native-classroom/README.md；证据为同目录evidence/observations.json与两张截图，均为合成数据。原型自有实例保持供用户审阅，不重启正式3080/开发3097。


## Resolution · 用户确认（2026-10-24）

用户明确选择采用3098原型：左侧保留讲义/练习，老师使用右侧已有原生会话区，不在应用内部再嵌入第二套对话容器。生产07据此接入，原生布局和编辑器唯一所有者仍是Harness/Worktable。此票关闭的是实际原型已证明且用户确认的接入路径，不是轨迹、审批、Stop或完整学习闭环通过；这些继续由10真实模型验收。可丢弃代码保留在12250d9上下文分支，不合并生产。
