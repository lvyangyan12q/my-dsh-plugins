# 04: 考公注册与默认实例接入

**What to build:** 工作台中的考公入口打开同一套学习内容，已有数据继续可用，缺少工作台时保留独立入口。

**Blocked by:** 01 考公视图整理与独立使用回归；03 工作台侧边栏入口与应用窗口。

**Status:** implemented; automated verification passed; final installed UI/runtime acceptance pending

- [x] 课堂、练习、错题、讲义和计划复用真实业务内容；默认实例仅有一个共享业务 state。
- [x] 默认实例直接使用已有 Host 数据和路由，无删除或迁移。
- [x] 自动化验证可选工作台消失/重现、独立入口恢复、Cordis 热更新无重复注册。
- [ ] 最终安装态页面、图片、桌面/窄屏及 Better Sidebar 有无验收。

证据和 06 可消费的页面 props、结构化角色 handoff、共享 state 接口见 [ticket04-kaogong-evidence](../../../docs/ticket04-kaogong-evidence.md)。真实课堂会话和 Host 持久角色关联归 06/07；现有剪贴板转交不作为课堂完成证据。
