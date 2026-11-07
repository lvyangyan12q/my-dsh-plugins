# bug-solver 设计与实现独立审查

审查日期：2026-10-28。基线：当前工作树，HEAD `57cab599b2415fcb6eef8a90e8011ce25766200b`。既有未跟踪修补脚本、HTML 备份未修改。本报告核对当前源码与规格，不以旧审查结论或工单 resolved 作为正确性证据。

## 结论与设计路线

路线基本落实，但不能认定代码与 spec/ticket 完全一致。窗口3有可运行的编排骨架，仍有并发、重启恢复和路径隔离缺陷；窗口4只有规格和入口提示。

| 层次 | 当前路线与代码证据 | 状态 |
| --- | --- | --- |
| Worktable | 提供 HTML 窗格、文件通道、布局存储；`scripts/worktable-layout.cjs:87` 直接导入相邻 worktable 的 `project-layout.mjs`，共用 schema、锁和 revision | 基于 Worktable 承载，不是复制其核心；该 CLI 依赖相邻源码 |
| 窗口1/2 | 缺陷列表派发草稿；窗口2收敛为 SSH 配置 | 已实现，仍有默认值/缓存偏差 |
| 窗口3 | 独立 Host 桥创建修复/只读审核会话；确定性状态机，每轮先批准方案再实现 | 主流程已有实现和 fake 测试 |
| 安装验收 | `window3-dispatch/implementation/issues/05-install-mount.md` 尚未闭合 | 本轮未执行真实安装、重启、服务器操作或原生会话验收 |
| 窗口4 | 旧规格提出复盘、知识候选、语料归档；`window3-dispatch.html:1965–1967` 仅 toast；无窗口4 HTML、RetroService 或 retro 路由 | 未实现；新增 agent 流程评估集需求须补充决策 |

## 确认的问题

### P1：并发派发可创建重复运行

位置：`bridge/lib/dispatch-service.js:348–399`。读取列表、检查同 bug/同仓库、写入 run 之间无事务或互斥；RunStore 串行写盘并不保护前面的检查。

用现有测试 harness 并发执行两次相同草稿 `Promise.all([service.start(draft), service.start(draft)])`，实际创建两个不同 runId 和两个修复会话。跨标签页或并发 HTTP 请求即可触发。违反窗口3规格的幂等、同仓库串行要求（User Stories 5/37）。建议原子保留 requestId、bug 和仓库占用，再创建会话。

### P1：桥重启没有恢复待完成请求

位置：`bridge/lib/host.js:119–125`、`bridge/lib/index.js:97–118`。pending/watching 只存在内存，重新创建服务后没有按持久化 run 重建绑定、重放权威日志。

fake Host + 同一 store 复现：启动 run，dispose gateway，重建服务，再送达原请求 completed 事件。run 仍为 fix_planning，新 gateway 的 pending 为空；resume 返回 illegal-transition。违反窗口3 User Story 27 和 RunStore 启动对账要求。应重建监听并核对日志；无法确认的运行明确暂停，不自动重发。

### P1：产物路径可经目录链接逃出 run 目录

位置：`bridge/lib/artifacts.js:53–58, 94–111, 133–137`。路径检查只做 resolve 后的文本包含关系，实际读写跟随 junction/symlink。

本轮在全新临时夹具中把 `repo/.bug-solver/runs/audit/round-1` 链接到夹具内的 outside 目录：readArtifact 读出了 outside 的 marker；writeArtifact 也在 outside 写入了文件。未访问真实敏感文件。违反规格的产物路径逃逸校验和每轮隔离要求。应在读写及 manifest 校验中验证真实目录归属，拒绝越界链接，并处理创建路径与检查/使用之间的竞态。

### P2：旧 SSH 项目配置仍扩大 allowedRoots

位置：`bridge/lib/index.js:43–46, 93–94`，`bridge/lib/ssh-config.js` 的 readAllowedRootsFromConfig。默认 provider 仍读取旧 projects 的 localPath 并合入许可范围。

旧 projects 按迁移约定保留，因此已从 UI 删除的旧路径仍可获得派发权限。这与当前地图“仓库/分支统一到窗口3”、README 和 IM07 的“allowedRoots 只来自插件配置”不一致。应去掉隐式 provider；不能把旧配置保留当作授权保留。

### P2：窗口1派发仍默认查最近24小时

位置：`tb-bugs.html:580`、`window3-dispatch.html:646`。窗口1明确写入24小时，窗口3优先沿用该字段，因此真实派发路径不会使用规格要求的最近3天。可能漏掉前两天的故障日志。应统一默认来源并覆盖窗口1到窗口3的测试。

### P2：SSH 配置缓存不会随窗口2修改刷新

位置：`tb-bugs.html:498–502`，刷新入口 `:972` 起。首次加载后缓存配置（包括 null），窗口1刷新缺陷并不失效该缓存。窗口2新增/修改连接后再派发仍可能使用旧配置，首次无配置时也无法带出后来新增的连接。应在派发前刷新配置或接收版本变化通知。

## 需要明确的验收策略

另有一项IM07遗留偏差（P2）：`tb-bugs.html:512–546, 574–576` 仍消费旧 `projects/serviceMap/links` 选择连接和代码项目，窗口3 `:641–642` 再据此预填路径/分支。旧数据可以保留，但规格要求不再参与派发；隐藏窗口2页签没有移除这条数据流。应停止消费旧项目映射，仅带SSH候选，仓库由窗口3指定。

`dispatch-service.js:831–850` 把缺失/错误 result.json 记为 warnings 后仍送审；现有测试也明确接受该行为。因此本报告不把它定为违背既定硬门禁，但窗口4收集时必须区分已审核、材料完整和已人工确认；不能用 approved 掩盖缺失材料。

现有窗口4规格只列 approved run，是否收集失败、返工和中断材料待决定。用户最新澄清：本期只收集、复盘与知识沉淀，为后续流程优化留资料；不设计质量评分或比较系统。co-dev Speckit已有增量复盘、材料筛选和知识归档方法，见[能力对照](../wayfinder/window4-retro/speckit-capabilities.md)。待决策见[窗口4决策地图](../wayfinder/window4-retro/map.md)。

## 验证与证据边界

- 桥：`node --test --test-isolation=none --test-reporter=dot "test/*.test.mjs"`，147项通过。首次沙箱运行因临时目录 rename EPERM 失败；沙箱外复跑退出0。
- 窗口3：`node scripts/smoke-window3-page.cjs`，38/38通过。
- 窗口1/2：`node scripts/smoke-window1-2.cjs`，退出0。输出81/81包含 SKIP，不应解读为81项有效验收；脚本汇总把 SKIP 计入通过数。
- 定向复现：并发重复run、重建桥丢失待完成请求、junction产物读写越界。前两项为 fake Host/harness，第三项为临时文件系统夹具。
- 上述测试没有覆盖真实 DSH 重启恢复、完整原生审批/Stop、实际挂载与窗口4。旧票 resolved 仅能表明历史施工记录，不能覆盖本轮发现。

建议先修三个P1并补相应回归，再修配置与UI契约偏差；窗口4沿用现有Host桥，先明确收集范围、会话证据与材料归属。此次只调整审查/规划文档，不改业务源码或历史票状态。
