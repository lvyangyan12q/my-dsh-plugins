# 05: Better Sidebar 可选接入

**What to build:** 用户从 Better Sidebar Tab 访问同一工作台，没有该插件时也可正常使用主入口。

**Blocked by:** 03 工作台侧边栏入口与应用窗口。

**Status:** ready-for-agent

- [ ] 可选适配通过公开注册接口并在卸载时清理。
- [ ] 两个入口共享数据和窗口，不重复创建会话。
- [ ] 兼容、缺席及停用三种环境验证通过，不兼容时明确提示。
