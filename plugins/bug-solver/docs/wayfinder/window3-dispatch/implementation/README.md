# 窗口3 调度台 · 实施图

2026-10-28 后续修复与同步优化见[统一增量规格与任务索引](../../../specs/bug-solver-next/spec.md)。下表为原阶段记录，不代表本次独立审查发现已修复；本轮任务由增量规格单独跟踪。

规格：[../spec.md](../spec.md)。这是施工任务图，不是决策图；做完不等于验收通过。

| 票 | 范围 | 依赖 | 状态 |
|---|---|---|---|
| [IM01 桥核心](issues/01-bridge-core.md) | Host 插件壳、`DispatchService`、`RunStore`、路由契约、fake 测试 | — | resolved |
| [IM02 正式页](issues/02-window3-page.md) | B 时间线 + 任务/对话只读 + API 适配 + 降级 | — | resolved |
| [IM03 窗口1/2](issues/03-window1-2.md) | 处理派发；窗口2 已收敛为 SSH-only | — | resolved |
| [IM04 会话循环](issues/04-session-loop.md) | 真实 SessionGateway、plan/implement/review、turn/end、messages | IM01 | resolved |
| [IM06 审查修复](review/spec.md) | 修 Spec/Standards 审查问题（needs_attention、产物、契约、分页、文档） | IM01–IM04 | resolved |
| [IM07 仓库/分支统一](issues/07-repo-branch-window3.md) | 窗口2 去项目配置；窗口3 填 repo/branch；去写回 | IM03, IM06 | resolved |
| [IM05 安装与验收](issues/05-install-mount.md) | 安装桥插件、重启、p3 清单、真实挂载/验收 | IM02, IM03, IM04, IM06, IM07 | in_progress |

## 施工规则

- 集成分支：`integration/window3-dispatch`；每个实施者在自己的 worktree + 分支上做，完成前把集成分支 tip merge 进来。
- 每个实施者先读规格、对应票、[research/01](../research/01-session-start-bridge.md)、[research/05](../research/05-two-session-handoff.md)。
- 不做安装/重启/挂载；IM05 单独做，重启需要用户明确同意。
- 测试优先：桥核心用 fake；页面用 jsdom/现有 preview；窗口1/2 用 jsdom 或预览脚本。
- 不修改 `data/`、`config/`、`.dsh-worktable/`（运行时/凭据）。
