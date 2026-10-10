# my-dsh

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

原生侧栏需应用 [通用插件区域兼容补丁](compat/native-sidebar-sections/README.md) 并构建原生 Client；工作台大菜单使用 `sidebar.sections`，不修改原生 footer 或内部 CSS 类名。发布构建会校验该前提。

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
