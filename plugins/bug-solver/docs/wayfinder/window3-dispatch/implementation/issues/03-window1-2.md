# IM03 窗口1/2

Status: resolved
Depends on: —

## Scope

- `tb-bugs.html`：「处理」=直接派发到窗口3；标题仍开详情；`localStorage` 草稿 + `BroadcastChannel` + 队列文件；按 bugId 幂等；已发送/等待确认/失败反馈。
- `ssh-config.html`：代码项目加 `localPath`；`ssh-config.json` v2 顶层 `serviceMap`（服务/容器 → 项目）；旧文件迁移补默认值；校验路径存在/是 git 仓库；保存写回。
- 不破坏现有拉取、详情、SSH 测试、分支读取、关联矩阵。
- 加最小 jsdom/预览冒烟（新脚本或扩展现有）。

## Acceptance

- 冒烟通过；旧 `ssh-config.json` 加载不报错并补 v2 字段。
- 提交到 `im03-window1-2`，merge 集成分支后报告。

## Result

已合入 integration（merge `3c0972d`；工作 commit `52949f6` + `e3a17e8`）。窗口1「处理」改为派发（双写草稿/双广播/队列文件，失败降级）；窗口2 加 `localPath`（绝对路径/存在/git 校验）与 `serviceMap` 页签；`ssh-config.json` v1→v2 迁移；顺带修了项目编辑器保存按钮未渲染和空配置崩溃。冒烟 83/83、窗口3 31/31、bridge 88/88。
