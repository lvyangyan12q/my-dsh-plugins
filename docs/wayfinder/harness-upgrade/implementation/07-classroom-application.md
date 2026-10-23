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
