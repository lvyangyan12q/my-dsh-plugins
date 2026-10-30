---
id: kaogong-standalone-01-native-standalone
title: 独立Host、原生入口及课堂
status: closed
assignee: ticket01
blocked_by: [kaogong-standalone-00-directory-consolidation]
---

规格：[spec](../spec.md)；交接：[HANDOFF](../HANDOFF.md)。

## 工作
- 完成学习主线原型评审；移除核心运行时/类型/peer对Worktable必需依赖。
- 考公自身提供档案上下文/资料权限/角色绑定/任务回执；复用既有业务引擎而非重做平台。
- 通过Native公开侧栏main与右侧面板提供总览和学习内容；完整Native对话为唯一输入/轨迹/审批/Stop。

## 验收
- [x] 干净官方rc.3 profile不安装Worktable仍能启动、创建角色并读取私有Skill。
- [x] 源码默认无TSXenv、显式source、编译入口可用；普通会话无考公私有能力。
- [x] 不修改原生源码、全局皮肤或隐藏覆盖Native标题栏。

## Resolution
已实现考公自身的档案、资料只读授权、Native角色绑定、持久教学请求与回执；保留旧业务引擎、原始评分、来源证明及Native Scope身份守卫。新档案只在页面明确确认后建立，不自动接管旧全局记录。02负责显式旧元数据接管。

用户已批准学习主线原型 `fce5151ee0fabfd9dc4c9e351de38d5f5f40c598`（独立原型分支，仅流程参考，未合并HTML），并确认Host HTTP/模型工具、Native侧栏/Session/右栏、页面确认及准确包端到端测试边界。客户端提交 `7d10c95d9471378c59aa060469772bfeaef0c171` 已合入本工单。

验证：Host公开接口及真实Native无模型测试22项、客户端及任务/来源面板13项、保留题目/评分/反思/课堂身份的领域测试21项通过；Host和Client均以官方公开声明严格检查，构建与发行内容检查通过。活动Host/client/声明图无Worktable依赖；历史接管实现不在活动入口图内。使用插件自有物理工具链，未改原生源码或共享依赖。

2026-10-26，准确候选包 `deepseek-ai-dsh-tool-kaogong-0.3.0-rc.3.1.tgz`（SHA256 `4c01dffbbf129e43db31c4c61e6eefe9c7a5d3e0ee05dcd1811e25fca8cbc606`）通过官方CLI安装到全新web profile，仅官方base/web与考公包，无Worktable和开发依赖祖先。官方Scope归属与安装Host导入检查通过。编译入口真实浏览器可见考公主侧栏，首次为空，确认后创建档案并进入总览，六页均可导航。私有运行回执保存在仓库外 `standalone01-1793022473478/installed/identity-0563af37-258f-4d08-963e-2364602f5433`；不发布登录令牌及学习内容。

上述初始包的冷恢复发现Native不保存临时navigation.params，已按公开接口补充精确Session查找：无参数时由Host校验唯一ready角色绑定及其登记视图；显式参数不匹配仍拒绝，普通Session和不唯一视图拒绝。新建绑定保留确切viewId。新候选同版本另存 `standalone01-cold-1793025178904/archives`，SHA256 `df09c11437cf00ef430aa57d92ccb9b9c5b62c3c107a445b1e72b8672f1fb95f`，未覆盖初始包。新包全新官方CLI独立安装检查通过；更新原隔离profile前后8个Session/storage文件逐字节不变。源码默认无TSXenv冷恢复通过：同一teacher Session、档案和视图，真实Native右栏与唯一对话输入保留。

新包三种实际启动（默认源码无TSXenv、显式官方源码tsconfig、编译入口）均冷恢复通过：同一档案、登记视图、standard老师Session和revision保留，真实Native右栏可见，无归属告警，完整Native对话只有一个输入框。每种启动均通过HTTP role-ensure验证已绑定角色的私有Skill目录；最终默认源码还明确创建新的standard辅导员Session并保留原老师身份。没有发送提示或调用模型。真实Native测试另创建普通standard Agent，确认其作用域无kaogong-teach且Host不授予学习上下文。仅停止本轮自有验收进程，3151已无监听，隔离home和准确包保留；私有汇总为新候选根目录的 `acceptance-summary.private.json`。

本工单不代替06真实模型/问答/审批/Stop矩阵和07准确发行包完整学习闭环；旧计划页文案/流程由03收口。06还须审计所有模型写工具，不能仅以普通会话排除私有能力宣称AI确认安全。02接管必须显式选择并保持旧身份与证明，01未自动接管历史学习记录。
