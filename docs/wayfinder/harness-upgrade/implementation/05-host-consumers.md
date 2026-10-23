---
id: harness-rc3-host-consumers
title: rc.3 目标声明、公开 producer 与两个消费者候选归档
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [harness-rc3-public-contracts, harness-upgrade-support-policy]
implementation_status: implemented
acceptance_status: pending-root-installed-native
target: 0.2.1-rc.3
---

## Scope

关闭的是 HU01/HU07 的明确目标声明、消费者公开编译和候选归档准备切片，不关闭完整 HU01/HU07。实现起点 `ed895b0`，原生固定 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60` / `0.2.1-rc.3`；最终两轴审查按用户确认的 `a81ac77` 由集成验收执行。

用户已确认正式环境等待兼容验收，未验收宿主仅在独立空 home/profile 显式试用。三个新候选使用官方实际识别的 `engines.dsh: 0.2.1-rc.3`；当前来源和未来正式支持不能由通配 peer 或旧 compatibility 文案决定。旧 alpha.2/rc.2 冻结包不修改。

## Implementation

- Worktable `0.10.0-rc.3.1`、Notes `0.2.2-rc.3.1`、Reading `0.2.3-rc.3.2` 明确目标。原生可选 peer 用真实 rc.3 版本；消费者使用实际 Cordis `4.0.5`，Notes Schemastery `3.18.5`，Worktable SDK 仍是必须的包 peer。
- producer 不再仅接受旧 alpha.2 的依赖身份；从精确归档安装 SDK 与真实 rc.3 公开包，在独立目录以 `skipLibCheck=false` 编译，断言 SDK、应用和 Skill 指向同一个真实 Cordis。没有源树祖先回退、peer bypass 或替代原生声明。
- Reading 从应用自有的最小结构合同描述可选冻结旧适配器，不再把旧 personal-workbench 生成声明/运行时作为新 SDK 构建前置；未声明任何同名上游替代模块。原有可选旧适配行为保留，其历史工厂资产只用于相应回归。
- Reading 在公开 Host 应用/资源和客户端视图接入前检查相应协议 feature。缺协议发现时明确拒绝，不误报注册成功；注册或撤销异常仍清理自己的视图状态。`build.mjs` 使用已声明的公开 tsdown JS 入口，消除 Windows shim 和仓库祖先工具依赖。
- 唯一 Worktable pack 入口加入真实 rc.3 公共 Config/门禁核对与路由生命周期回归；旧 server-home 夹具的 `effect` 从空操作改为执行公开注册回调。此前失败是夹具未激活合法路由，不是将生产注册改回泄漏行为。
- README 记录用户手动在新 home 使用官方 `allow-version <exact package@version> --dsh-version <exact> --accept-risk` / `revoke-version` 的试用与撤销。没有代码自动豁免、复制凭据、迁移正式数据或切换 3080。

## Evidence · 2026-10-24

测试接缝沿用已确认的官方声明门禁、公开应用/资源/视图合同、真实 StorageDomain/Settings、客户端工厂与独立 producer 编译。真实模型、实际 Host 服务激活和完整浏览器流程另验。

- Red：官方检查对旧通配 Worktable 在 rc.4 返回通过；要求未验版本拒绝的测试实际失败。精确声明后 rc.3 通过，rc.4 / 0.2.2 / alpha.2 均拒绝。显式精确试用豁免仅对指定包/宿主组合生效，不能外溢到另一版本；旧 Notes/Reading 字面声明对照继续拒绝。
- Red：旧视图服务缺 `describe` 时出现 TypeError；新测试要求兼容提示且零注册，先失败。公开协议发现以可缺省结果交给 `requireProtocol` 后转绿。
- 实际 rc.3 契约核对：9/9、0 skip。producer 两应用均通过，`skipLibCheck=false`，Reading 无旧声明前置。
- Notes 全套 22/22、0 skip；Reading 全套 31/31、0 skip。覆盖真实原生存储、数据隔离、同实例多视图、授权/撤销、配置和刷新恢复；模型执行仍是边界替身或未执行，不列为真实模型通过。
- Worktable `npm run pack`：额外 rc.3 契约 9/9；打包回归 299 项中 297 pass、2 个旧 rc.2 可选检查 skip；真实候选归档精确9文件、干净安装/import、客户端工厂、安装产物分栏/输入/标注/生成回调和 server-home 均通过。跳过项不算 rc.3 证据。
- 两消费者均通过自己的 `npm run pack`：真实 producer、构建、上述全部源码测试、独立 archive install/import 与逐文件校验；Notes5文件、Reading6文件。没有对正式 profile 或模型操作。

使用已正确构建的官方原生检出和 Node25.2.0。复现前设置 `DSH_SOURCE`、`WORKTABLE_NATIVE_RC3_ROOT`、`WORKTABLE_PACKAGE` 为精确归档、`npm_execpath`；Worktable 只运行其 `npm run pack`，消费者各运行自己的 `npm run pack`。若历史工厂回归需要，`READING_LEGACY_ROOT` 指向真实旧编译资产，不能当当前 producer 类型路径。现有固定版本目录拒绝重复准备，重打需新版本。

## Immutable scoped snapshots

相同目录中固定名与版本化名均同 SHA256。Worktable .1 是本切片初次打包快照，早于当前 README 和其他角色/课堂 SDK 分支；不能当最终集成包。最终集成必须用新版本，不能覆盖 .1。Reading .1 是当前 README 进入前的留存快照，.2 才是本票当前消费者候选；同样保留 .1 不覆盖。

| 包目录 | 固定名 / 版本化名 | SHA256 |
| --- | --- | --- |
| `plugins/worktable/01_content/dist/v0.10.0-rc.3.1` | `dsh-worktable.tgz` / `dsh-worktable-0.10.0-rc.3.1.tgz` | `eb78abb64bf195e2a7ec33b111b64dfa333251972af16c4060b0f1ad15341c52` |
| `plugins/project-notes/dist/v0.2.2-rc.3.1` | `deepseek-ai-dsh-project-notes.tgz` / `deepseek-ai-dsh-project-notes-0.2.2-rc.3.1.tgz` | `3844046b8829c9f2be028e9a23ad56c70077d8004bc1367d59559a0f8d7889f7` |
| `plugins/reading-statistics/dist/v0.2.3-rc.3.1` | `deepseek-ai-dsh-reading-statistics.tgz` / `deepseek-ai-dsh-reading-statistics-0.2.3-rc.3.1.tgz` | `f83e1240d274926f2bb49375e83a8a0a1612341f82ed20fd240d696c250ffa0f` |
| `plugins/reading-statistics/dist/v0.2.3-rc.3.2` | `deepseek-ai-dsh-reading-statistics.tgz` / `deepseek-ai-dsh-reading-statistics-0.2.3-rc.3.2.tgz` | `94045bc07fb7c4f2298bae7ff5dcb52b3601a338550f804713d21913dfcdaea5` |

## Remaining acceptance

- [ ] 最终集成新 Worktable 包重新经过同样唯一 pack 门禁；包含角色接管等新 SDK 源码时使用新版本，加入对应新回归。
- [ ] 工单10在实际官方 DSH 中安装最终组合，运行 Notes/Reading 两实例、多视图、角色任务、原生执行/审批/Stop、升级恢复及卸载重装。
- [ ] 未验收新宿主的官方精确豁免只在独立试用环境演练；本票没有声称未知新版本真实可运行。
- [ ] 最终审查、资料保护复核与部署/远程交付仍由集成阶段处理。

此票 closed 仅表示上述实现与候选准备范围完成；`acceptance_status` 明确保留真实安装待验，不能拿代码、归档或测试成功代替应用闭环。
