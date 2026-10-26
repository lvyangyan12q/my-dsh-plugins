# 项目布局工具

此脚本在本仓库中使用，与 Worktable 共用布局格式、原子保存、目录锁和修订检查。每个项目固定使用 `.dsh-worktable/layout.json`，不再写按项目 ID 命名的主文件。

从仓库根目录执行，替换示例中的项目目录：

```powershell
node plugins/bug-solver/scripts/worktable-layout.cjs show --folder '<项目目录>'
node plugins/bug-solver/scripts/worktable-layout.cjs set --folder '<项目目录>' --title '项目名称' --top 2 --main 1
node plugins/bug-solver/scripts/worktable-layout.cjs rename-pane '<窗格ID>' 'herdr' --folder '<项目目录>'
node plugins/bug-solver/scripts/worktable-layout.cjs backup --folder '<项目目录>'
```

不传 `--folder` 时使用 bug-solver 项目目录。目录必须已存在；首次创建必须传 `--title`，项目身份由工具生成，之后一直保留。可在首次创建时明确指定 `--project-id`，已有布局不能借此更换身份。

- `show` 只读，不自动迁移。加 `--json` 输出机器可读的状态和布局。
- `set` 未传的数量、名称和尺寸保留；已有窗格及标签内容保留。减少含内容的窗格默认拒绝；确需删除时明确加 `--allow-remove`，写入前会保存备份。
- `--ratio` 在 0.15 与 0.85 之间，按已保存顶行高度及原比例缩放，不假定当前浏览器视口高度；原比例缺省为 0.5。实际显示仍由 Worktable 按可用视口钳制。
- `rename-pane` 支持左列、左列叠放窗、顶行和主行；窗格 ID 可由 `show` 查看。
- 每次修改前保留带唯一名称的 `layout-backup-*.json`；`backup` 可单独创建快照。备份不作为自动读取的第二份主文件，也不包含应用业务数据。
- 可加 `--expect-revision N` 拒绝过期操作；创建或迁移的预期修订为 0。即使不传，此脚本仍在读到的修订上提交，另一写入方先保存时返回冲突，不自动覆盖重试。
- 主文件不存在且只有一个合法旧文件时，`show` 返回旧候选，`set` 将其保存为新主文件并保留旧文件。有多个候选时先查看列表，再明确传 `--legacy-file '<旧文件名>'`；损坏或不兼容的主文件不会被缓存或默认布局替换。

脚本成功保存后，重新打开项目加载新布局。界面已经有未保存修改时，应先处理其保存/冲突提示；本轮不提供任意外部编辑器并发写入保证。此脚本依赖本仓库的共享存储源码，不能只复制一个脚本到其他目录使用。

版本3保留逐窗 `minimized`、手动展开几何及按窗格ID保存的 `geometry.leftHs`。`rename-pane` 和 `set` 不丢弃这些状态；左列 `leftWs` 仍为宽度。共享存储支持读取版本1/2，并在版本2首次写入版本3前保留原字节备份；未知版本拒绝写回。
