# 01: rc.1 兼容并启用

**What to build:** 让学习插件能在当前 DSH `0.2.2-rc.1` 上真实安装、激活并跑通现有功能；不再声明只能跑 alpha.2。

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] 宿主版本声明与两个 peer（存储、工具）同步到 `0.2.2-rc.1`，不再要求 alpha.2。
- [x] 重新构建产物，现有 20 项自动化测试在 rc.1 上得到同样结果（19 通过 + 1 条 `DSH_SOURCE` 条件跳过）。
- [x] installed-gate 在官方 rc.1 构建上完成安装、启动、创建、进程重启恢复，并产出新回执与新哈希（`564ca529…`）。
- [x] 插件在官方 rc.1 的隔离安装中激活成功、无告警；日常 profile 的启用与浏览器验收由 09 覆盖。
- [x] 旧的 alpha.2 回执与哈希保留为历史证据，不被写成 rc.1 已通过。

