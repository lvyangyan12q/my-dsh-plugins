---
id: harness-rc3-classroom-application
title: 课堂经公开工作台接入同一原生对话
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [harness-upgrade-classroom-prototype]
target: 0.2.1-rc.3
---

按课堂原型已验证的最小公开接缝接入考公课堂，沿用既定工作台布局、原生菜单及唯一输入区。应用保留讲义、练习及课堂业务界面；同一角色继续使用同一 Session。不能用仅跳转后丢失课堂界面冒充嵌入。

- [ ] 原型分支及已验证结论留在决策票，原型代码不合并生产。
- [ ] 角色切换、同实例多视图、关闭重开和焦点/滚动释放正确。
- [ ] 原生对话、轨迹、问题/审批与 Stop 指向绑定的 Session，隐藏视图不误停。
- [ ] 通过公开 SDK/Host 接缝，不向应用暴露任意原生全局上下文，不修改原生源码或私有编辑器。
- [ ] 真实安装记录与可复现回归分别留证，不以模拟 AI 原型关闭实际执行验收。

## 生产代码切片（2026-10-24）

实现位于 `plugins/kaogong/src/client.tsx` 与 `sdk-classroom.tsx`，通过 `worktableApplicationViews` 注册学习和只读资料库视图。采用已确认原型的内容左侧、工作台现有原生会话右侧布局；原型代码没有合并。旧独立入口保留冻结提示，旧源码另存为 `legacy-client.tsx` / `legacy-knowledge-reader.tsx`，新客户端产物不包含 personal-workbench 或第二套原生会话容器。

状态由插件生命周期持有：实例共享课堂、练习、答案与请求竞争保护；视图分别持有页面、筛选、资料选择、角色选择及公开服务。草稿与讲评标记按实例存储，显示偏好按实例和视图存储，不导入旧 default 浏览器状态。请求和图片引用均在渲染/发送时携带不可变 `viewId`，Host 决定实例归属，业务请求不能另选实例。

角色仅通过公开 ensure/open，保留精确 Session 和 revision，失败不重复发送。普通教学使用公开 prepare；已保存课堂和讲评仅传 lessonId/roundId 给公开 prepareOwned，生命周期由 Host 管理，不执行旧浏览器 beforeSend/afterSend。

验证：五个公开接缝/真实组件渲染测试通过；当前公开 SDK 客户端 TypeScript 检查通过；tsdown 客户端构建通过，产物扫描未发现旧 workbench 或 role-conversation 引入。测试并非真实模型执行证据。

代码切片已实现，整票仍保持 open：待 Host 接入后真实安装、多视图关闭重开、轨迹/审批/Stop、刷新重启及真实模型验收，随后才可关闭。
