# Worktable 0.10.0-rc.3.4

项目布局固定保存为 `.dsh-worktable/layout.json`。包含完整尺寸与标签引用保存、从目录恢复、旧文件迁移、原子写入和修订冲突保护；补齐左列扩展窗的任务与标注归属，恢复终端需显式启动。

源码基线：`e29037e7f6c775014e8b2f6db211b67c34e090c0`。使用唯一入口 `npm run pack` 生成，未覆盖旧版本资产。

| 资产 | 字节 | SHA-256 |
| --- | --- | --- |
| `dsh-worktable.tgz` | 587654 | `973861d693c020e0e8dfc89f999f6eca3c910aff9990c68f2ddc5f6c7816cf13` |
| `dsh-worktable-0.10.0-rc.3.4.tgz` | 587654 | `973861d693c020e0e8dfc89f999f6eca3c910aff9990c68f2ddc5f6c7816cf13` |

官方 rc.3 契约 9/9；兼容回归 380 通过、0 失败、2 项可选 rc.2 测试跳过。包结构恰好 9 文件，独立安装和导入通过；包内客户端分栏 11 场景通过。最终归档经官方 CLI 安装到新的隔离 home，实际 9 文件与归档逐字节一致。

真实 Windows Web 验收包括尺寸保存、关闭重开、清空测试缓存后从目录恢复、宿主冷重启、旧文件迁移、损坏文件保留、脚本与浏览器冲突拒绝，以及恢复终端不自动启动。未操作正式 profile，未发布远端 tag/Release；本目录为 Git 跟踪的冻结资产。

详见[验收工单](../../../../docs/specs/worktable-project-layout/04-acceptance.md)、[打包回执](../../../../docs/specs/worktable-project-layout/evidence/pack-validation.json)、[实际宿主回执](../../../../docs/specs/worktable-project-layout/evidence/host-acceptance.json)和[两轴审查](../../../../docs/specs/worktable-project-layout/review.md)。
