# 03 窗口2 数据：本地仓库路径与服务映射

Type: grilling
Status: resolved
Blocked by: —

## Question

修复会话需要「缺陷 → 服务器连接 → 本地仓库路径」这条链，但现在窗口2 只有：

- 连接：host / port / user / key；
- 项目：`remotePath`（服务器目录）、`repo`（git 地址）、branches；
- `links` 是空的，bug 的 `repo` 也是空的。

要定：

- `localPath` 放在项目上，还是 connection × project 关联上？
- 「服务 / 容器 → 项目」映射存哪（`data/ssh-config.json` 扩展、`data/dispatch/mappings.json`、还是 `config/herdr-env.json`）？确认页现场补的映射怎么写回？
- 与现有 `herdr-env.json` 的关系：合并、还是让 window2 成为唯一来源？
- 旧数据迁移与校验（路径不存在、非 git 仓库、仓库脏）。

## Answer

决策已并入 [窗口3 规格](../spec.md)：`localPath` 放在代码项目上（`project.localPath`）；「服务/容器 → 项目」映射放 `ssh-config.json` v2 顶层 `serviceMap`；窗口2 仍是主来源，`herdr-env.json` 只作旧诊断脚本兜底；v1→v2 迁移补默认值、不丢数据。
