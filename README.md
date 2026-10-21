# my-dsh

## 当前实施 · 2026-10-21

已按用户要求继续工作台后续实施，唯一集成分支仍为 `codex/worktable-framework`。请先看[当前进度](docs/STATUS.md)、[后续范围](docs/wayfinder/worktable-platform/continuation-spec.md)和[12—19任务图](docs/wayfinder/worktable-platform/implementation/README.md)。首阶段01—11保留关闭；完整规格仍open，考公专项继续暂缓。

隔离3091已通过官方未补丁DSH0.2.0-rc.2安装Worktable0.8.0、Notes0.2.0及Reading0.2.0候选组合并重启。12草稿Host生命周期、13公共展示和16原生状态/存储故障已真实验收关闭；14模块内搭建与18升级影响确认正在实施，15/17/19继续按依赖推进。3080保持先前0.7.2部署，本轮尚未同步候选，也尚未推送本轮增量。

下面2026-10-20入口及旧平台段落是历史记录，不覆盖本段。

## 当前入口 · 2026-10-20

本轮以 **Worktable 派生 AI 工作台**为代码基线，源码在 [plugins/worktable/01_content](plugins/worktable/01_content/)，独立应用示例为 [Project Notes](plugins/project-notes/) 与 [Reading](plugins/reading-statistics/)。代码与文档位于 `codex/worktable-framework` 分支；首阶段11张工单已关闭，完整spec仍open。

明天接续先读 **[交接与代码位置](docs/wayfinder/worktable-platform/handoff.md)**、**[实现技术路线及后续待办](docs/wayfinder/worktable-platform/technical-roadmap.md)**、[完整框架spec](docs/wayfinder/worktable-platform/framework-spec.md)和[首阶段工单](docs/wayfinder/worktable-platform/implementation/README.md)。3080已于本日获用户授权切换至0.7.2，仅完成当前alpha.2宿主的安装/加载/控制室页面检查；完整阶段验收仍以rc.2记录为准。3091验收实例已按用户要求停止。

以下插件列表、根目录启动/安装命令及旧菜单说明保留为 **personal-workbench 旧平台记录**，不能用它们判断新派生包已安装。新旧代码并存不是两套前台一起运行，考公专项仍暂缓。新包接入与运行边界见交接文档。

文档入口：[当前进度与待办](docs/STATUS.md) · [规格](docs/specs/README.md) · [工单](docs/tickets/README.md) · [验收](docs/verification/README.md) · [历史](docs/archive/README.md)

DSH 的本地插件仓库。

- `plugins/personal-workbench`：工作台、Agent 和 Skill 管理。
- `plugins/kaogong`：新版考公学习插件。
- `plugins/reading-statistics`：独立阅读应用，复用公共展示模块并持有自己的数据。
- 插件来源：原 my-dsh-plugins 的 release-verification 提交 e8f01d3。

## 本地运行

```powershell
pnpm install
$env:DSH_SOURCE = "D:/programming/workspace/deepseek-harness"
pnpm run build
node "$env:DSH_SOURCE/apps/cli/lib/bin.js" plugin --profile web add "link:D:/programming/workspace/my-dsh/plugins/personal-workbench" "link:D:/programming/workspace/my-dsh/plugins/kaogong"
pnpm start
```

默认地址：http://127.0.0.1:3080/ 。需要临时验收端口时运行 `powershell -File scripts/start-dsh.ps1 -Port 3082`；两者使用同一个 web profile，不应同时启动。3081 为原合成测试实例，与真实学习数据分开。

应用平台的扩展与验证步骤见 [开发流程](docs/application-platform-extension.md) 和 [验收证据](docs/application-platform-acceptance.md)。阅读模板需要安装 `@deepseek-ai/dsh-reading-statistics` 并应用其 bundle patch；保存和预览草稿后仍需显式启用。

工作台通过原生公开面板、会话与布局能力接入；不得给原生源码或 lib 打补丁。compat/native-* 仅为历史归档，不是安装步骤。发布构建使用独立已构建原生运行时，继续执行公开类型、客户端模块和官方安装验证。构建候选仅允许未补丁 0.2.0-rc.2 与 0.2.1-alpha.2，版本声明不是验收通过。rc.2 已通过隔离构建/回归/安装检查；alpha.2 在源码561fc228已通过独立构建、全量回归及官方安装消费者三门禁；自有实例561已冷升级启动，根面板布局、模板和任务冷恢复、新实例与并发唯一绑定有实页证据；此前1ab卸载重装与回滚证据分版本保留。完整范围仍按工单逐项验收。正式混合依赖等价验证仍有21项 strict 类型错误，正式部署尚未通过。完整状态见 docs/wayfinder/workbench-completion/implementation/README.md。

## 菜单

原生工作区保留；工作台、Agent、Skills 为独立纵向入口。考公学习是工作台下面的子菜单，教师验证不再占用一级菜单。Agent 和 Skills 直接打开对应目录。

## 独立学习窗口

考公统计页以全宽显示进度和计划。点击右上角「打开学习窗口」进入应用内的独立学习窗口；窗口包含课堂、讲义、练习、错题和角色对话，不显示统计卡片。点击「讲解」准备任务时也会进入该窗口，仍需核对后明确发送。

「返回统计面板」或 Escape 关闭窗口。当前老师会话、未发送草稿、资料筛选、已选资料和未提交答案会保留；窗口不会创建第二套学习数据。DSH 原生左侧菜单保持可用。

## 数据和资料

- 当前插件代码：`plugins/personal-workbench`、`plugins/kaogong`。
- 实际资料工作目录：`D:/programming/workspace/my-dsh/materials/kaogong`。
- 历史图片：上述目录下的 `题目_images`。
- MinerU 结果：上述目录下的 `storage/mineru`。
- 学习数据继续使用 `C:/Users/pc-zzy/.dsh/storages`。
- 旧 `D:/programming/workspace/kaogong` 已成为指向资料目录的 Windows Junction。保留该链接，因为历史会话头记录的工作目录不可修改。

原始 PDF、讲义、题目、历史解析结果和旧辅助环境已完整搬入资料目录。资料、凭据与 `.local` 备份不提交到 Git。正式 profile 只引用 `plugins` 中的新插件代码。迁移记录在 `.local/paths.json`，接口和数据校验在 `.local/startup-verification.json`。


