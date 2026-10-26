---
id: worktable-layout-acceptance
parent: worktable-project-layout-spec
title: 最终产物验收与远程交付
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [worktable-layout-storage, worktable-layout-client, worktable-layout-tooling]
---

按规格的主验收入口测试最终包；运行相关回归及最终产物安装验证，执行 Standards/Spec 两轴独立审查并修复。记录证据和限制；不得把构建、DOM夹具或模拟宿主记为真实DSH安装验收。

完成后推送集成分支到当前 origin，不强推，不提交无关文件。真实验收缺条件时保留工单/规格 open，明确阻塞及已经完成部分，不能假关闭。

## Resolution

第一阶段实现、最终产物验收及远程交付已完成，按本地跟踪器关闭。本次扩展的05—07和父规格继续open，不因本票关闭而视为新增功能已实现。

- 用户明确确认公开目标与完整推送范围后，集成分支已推送并核对远程初始SHA与本地 `95cb71b91676511b0cc9465be8c98ee17287fa96` 一致；[草稿PR #4](https://github.com/lvyangyan12q/my-dsh-plugins/pull/4)已创建并附加到本任务，方向为 codex/worktable-project-layout → main，未合并。

- 代码集成 `e29037e`；Standards 初审 1 项、Spec 初审 3 项及追加 1 项均修复，独立定向复审两个轴剩余 0 项。详见[审查报告](review.md)。
- 最终候选 `0.10.0-rc.3.4` 使用唯一打包入口生成：官方 rc.3 契约 9/9，兼容回归 380 通过、0 失败、2 项可选 rc.2 测试跳过；结构 9 文件、独立安装/导入、最终 bundle 分栏 11 场景及服务端目录验证通过。环境失败和重试原因保留在[打包回执](evidence/pack-validation.json)。
- 固定名和版本化资产各 587654 字节、同 SHA `973861d693c020e0e8dfc89f999f6eca3c910aff9990c68f2ddc5f6c7816cf13`，已冻结于[发布目录](../../../plugins/worktable/releases/v0.10.0-rc.3.4/README.md)。
- 实际官方 rc.3 CLI 在全新隔离 home 安装最终资产，实际安装的 9 文件与归档逐字节一致；此前开发 link 替换不完整的尝试被拒绝作为验收依据，未覆盖其源目录。
- 真实 Windows Web 完成：仅拖动保存、标签保存和重开、清空专用浏览器缓存后从目录恢复相同 ID/内容/尺寸、宿主冷重启、旧文件迁移且原字节保留、损坏文件不覆盖、布局工具与浏览器冲突拒绝和显式重载、终端恢复零自动连接。详见[宿主回执](evidence/host-acceptance.json)。
- 自有测试宿主已核对身份并停止；未读取或复制正式凭据、未修改正式 profile、未发送模型消息；官方运行时源码无 tracked 变更。Desktop/macOS 与任意外部编辑器并发不在已验范围。
