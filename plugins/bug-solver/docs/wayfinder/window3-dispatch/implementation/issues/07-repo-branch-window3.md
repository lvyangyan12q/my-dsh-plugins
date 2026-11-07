# IM07 仓库/分支统一到窗口3

Status: resolved
Depends on: IM03, IM06

## Scope

用户决策（2026-10-28）：窗口2 不再维护代码项目/本地路径/服务映射；代码仓库路径、基线分支、目标 spec 统一在窗口3 派发确认页填写。

- 窗口3：确认页去掉「代码项目」下拉与「写回窗口2」开关；新增「代码仓库本地路径」「基线分支」字段；派发直接 `POST /start`，不再 `POST /writeback`。
- 桥：`start` 只校验 `project.localPath`（allowedRoots + git + 干净）与 `baseBranch`；不再校验 `projectId`；`baseBranch` 兼容旧 `defaultBranch`。
- 窗口2：只保留 SSH 连接；隐藏代码项目/服务映射/关联视图页签；旧数据保留但页面不读写。
- 文档/测试：规格、README、冒烟更新；窗口1/2 旧项目断言标记 SKIP。

## Result

已合入 integration（commit `3cce052`）。窗口3 冒烟 38/38；窗口1/2 冒烟 81/81（旧项目断言 SKIP）；bridge 147/147。窗口3 页面不需要重启 `dsh web` 即可生效；桥的 `baseBranch` 兜底改动需下次安装/重启才用上，但页面同时发送 `defaultBranch`，当前安装版可直接工作。
