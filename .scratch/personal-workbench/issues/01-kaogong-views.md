# 01: 考公视图整理与独立使用回归

**What to build:** 考公内容与独立窗口外壳分离，用户仍能通过原入口学习和练习，为工作台复用准备同一内容视图。

**Blocked by:** None (can start immediately).

**Status:** implemented; live standalone regression pending

- [x] 内容可嵌入其他外壳，业务请求和练习状态不重复创建。
- [x] 原入口及关闭行为保留，教学跳转不被面板遮挡。
- [ ] 题库、图文、练习、错题和计划回归通过，不迁移或删除个人数据。
- [x] 完成相关构建及有针对性的回归测试。

Evidence: commit `bc13c34`; 28 existing tests and 5 new view tests passed, with Host/client builds. Real-host standalone image/table and practice regression remains unchecked. No study data or daily profile was modified.
