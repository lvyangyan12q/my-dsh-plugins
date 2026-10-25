---
id: kaogong-standalone-01-native-standalone
title: 独立Host、原生入口及课堂
status: open
assignee: null
blocked_by: [kaogong-standalone-00-directory-consolidation]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 完成学习主线原型评审；移除核心运行时/类型/peer对Worktable必需依赖。
- 考公自身提供档案上下文/资料权限/角色绑定/任务回执；复用既有业务引擎而非重做平台。
- 通过Native公开侧栏main与右侧面板提供总览和学习内容；完整Native对话为唯一输入/轨迹/审批/Stop。

## 验收
- [ ] 干净官方rc.3 profile不安装Worktable仍能启动、创建角色并读取私有Skill。
- [ ] 源码默认无TSXenv、显式source、编译入口可用；普通会话无考公私有能力。
- [ ] 不修改原生源码、全局皮肤或隐藏覆盖Native标题栏。

## Resolution
尚未实施。记录准确源码/包、实际结果和仍缺项后才能关闭。
