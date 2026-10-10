# 可选侧栏卸载清理：公开接缝研究

日期：2026-10-10。研究基线：工作台 `f65339a`；本地 DSH `639ed015397290b3745d163aafe02ffee4aa3f84`，包版本 `0.2.0-rc.2`；已安装 Better Sidebar `0.24.1`。仅源码和发布类型研究，没有启动模型、操作验收实例、修改正式配置或实现修复。

## 结论

本地 rc.2 **确实提供了版本限定的、发布类型可见的接缝**：`Context.sidebarRight.openTabs` 可枚举自有原生 Tab，`Context.sidebarRight.closeIn(sessionId, tabId)` 可关闭已 adopted 的会话布局中的指定 Tab。这不是“看到 concrete 类里有方法，所以猜它公开”：`lib/types/client/index.d.ts:23` 的 Context augmentation 明确声明 `sidebarRight: SidebarRightController`，其发布 `service.d.ts` 明确包含这两项。源码对应 [Context 声明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/index.ts#L84) 与 [控制器](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/service.ts#L262)。

但 **它不是所有已保存会话的耐久删除契约**。`ISidebarRight` 本身不包含 `openTabs`/`closeIn`；源码还明确把 `closeIn` 称为不属于 `ISidebarRight` 的 Tab domain 路径。目标会话未曾 adopted 或 adoption 已释放时，调用严格无操作。它不创建 store、不挂载 dormant 会话、不直接更新其保存布局，也不排队等待 adoption。因此目前不能宣布完整卸载清理已经找到无条件可用的公开方案，更不能宣布实际残留已修复。

## 契约与限制

| 接口 | 已核实范围 | 不可推导的保证 |
|---|---|---|
| Better Sidebar `registerTab` 返回 disposer | 删除 descriptor 并通知订阅者；是公开导出服务契约 | 不会自动删除现存原生 Tab 或保存布局 |
| Better Sidebar `closeTab(id, scope)` | 有 native record 时调用 native surface；否则尝试独立 bottom layout | 不保证 provider/view 卸载后仍能找回原生 record |
| 原生 `sidebarRight.mounted` + `close(id)` | 针对当前屏幕会话；没有可用会话面时命令会 throw | 全局插件面板会使 mounted 无值，不能依赖它清理后台会话 |
| 原生 `sidebarRight.openTabs` | 元数据 observable，枚举已保存与 adopted 会话；可用精确 kind 筛选 | 看到 dormant 保存记录不等于其 store 已 adopted，也不等于可写 |
| 原生 `sidebarRight.closeIn(scope, id)` | rc.2 Context 发布类型可见；指定已 adopted 会话；保留其他 Tab；遵守最后 guide 规则与同步 close handler | 不承诺未 adopted/已释放会话删除；handler 抛错时保留 Tab；不支持跨版本自动兼容 |
| 原生 Tab registry disposer | 撤销类型及渲染注册 | 不清除 Tab membership；撤销渲染与删除布局是两个动作 |

证据：Better Sidebar 发布 `lib/types/client/service.d.ts` 与 [服务实现](https://github.com/omdsh-dev/DSH-better-sidebar/blob/main/src/client/service.ts) 中 `registerTab`（本地 711 行）/`closeTab`（1066 行）；原生 [closeIn](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/service.ts#L364)、[无 adopted actions](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/service.ts#L713)、[类型 disposer](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/tab-registry.ts#L269)。Better Sidebar 链接为上游导航入口而非不可变快照；本报告行为依据本地已安装 0.24.1 文件，不把上游 main 当版本证明。

## 已观察残留的可解释路径

本仓库 [实际安装验收记录](../../evidence/2026-10-10/better-sidebar-historical-matrix-browser.json) 已证明：正确捕获真实 native ID 后，停用 Better Sidebar 仍残留一个不可用工作台 Tab；刷新仍存在。研究没有重跑或覆盖该失败。

Better Sidebar 的 `NativeTabAdapter` 在 React view effect teardown 中执行 `records.drop(nativeTab.id)`（本地 `src/client/native/tab-adapter.tsx:357`）；native surface `close` 首先查询 record，缺失直接返回 undefined（`src/client/native/surface.ts:201`）；服务收到 undefined 再走 bottom reducer，而 native Tab 不在 bottom layout。这能解释为何 mock 中 record 仍存时关闭通过、真实 view 卸载后失败，但**不能单凭源码证明真实 teardown 的全部时序**。应在隔离实例记录公开 observable 及 disposer 调用序列进行验证，不改 DOM 或私有布局。

另外，0.24.1 surface 顶部“布局 memory-only”的旧注释不适用于当前 rc.2：原生 [库存实现](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/src/client/tab-inventory.ts#L28) 会读取保存布局；[测试](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/tests/tab-inventory.client.spec.ts#L16) 包含 dormant 保存会话。不要用该旧注释降低刷新/重启验收要求。

## 推荐实施决策

1. 给当前 rc.2 建立明确版本限定的 native lifecycle adapter；使用发布 Context 类型，不扩写一个假想的 `ISidebarRight`。以原生 `openTabs` 的 **kind === personal-workbench.catalog** 精确匹配拥有权；Better Sidebar 的 native registry 将 `kind` 设置为 descriptor.id（本地 `src/client/native/index.ts:288`），不按标题、图标或前缀猜测，不关闭其他种类。
2. 此 adapter 的观察/清理所有者应独立于 Better Sidebar 的 view record 和 inject child；服务失效时仍需原生服务存活才能执行清理。先证明执行时机与 close handler 行为，不能靠保存一个已 dispose 的 Better Sidebar 引用。
3. 已 adopted 会话可尝试 typed `closeIn`，并从 `openTabs` 重新核实移除结果；返回 void 不等于成功。对未 adopted/已释放的保存会话必须报告 pending/unsupported，不允许直接编辑 localStorage、访问私有 adopted map 或强制打开会话冒充无侵入清理。
4. 若验收要求在全局停用后立即、耐久清除全部 dormant 保存 Tab，当前公开实现不足；需明确 upstream 的持久布局清理/生命周期扩展决策，或在获认可的正式契约下提供会话 adoption 后的延迟清理并验证其持久性。延迟方案尤其不能在工作台自身卸载后还假定其 adapter 存活。该问题保持 open。

## 可复现外部验收方案

仅用独立 DSH profile/端口与官方安装产物；不操作正式实例。创建两个测试会话并给每个留一个其他提供者 Tab；再打开工作台 catalog，包含 docked/floating、隐藏/可见各一例。保存脱敏初始 inventory 计数、会话树/会话草稿和业务摘要哈希。用全局原生插件面板分别停用 Better Sidebar、停用工作台；捕获公开 inventory/disposer 时间顺序，检查自有 Tab 清零、其他 Tab/会话/草稿不变，无私有 DOM 操作。

至少分三组：

- A：已 adopted 但当前全局面板盖住会话。验证 `mounted` 无值仍能按 scope 清理；多会话及浮窗清理无误。
- B：浏览器重载后只有保存库存、目标会话尚未 adopted。证明是否仍残留；若采用延迟清理，进入该测试会话后才删除并再次重载/Host 冷重启验证，不把此结果记为立即清理成功。
- C：服务未加载、版本不匹配、storage 不可用、close handler 抛错，以及热更新后重复注册。需要明确提示且保留其他提供者 Tab；重新启用不产生重复入口。

确认移除须结合实际原生 strip、inventory 与刷新/冷重启后的状态；只看 catalog body 消失、mock 的 close 方法被调用，或关闭 renderer registration 均不足。既有 [原生 service 测试](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-sidebar-right/tests/service.client.spec.ts#L712) 已说明 close handler 抛错保留 Tab，但本研究未执行这些测试、未建立上述实页矩阵的通过证据。

## 本地发布类型指纹

下面指纹标识本次确实读取的文件；可复查安装产物，不能单靠版本号假定所有 rc.2 构建相同。原生包源码目录无本地修改；没有提交任何 core 文件。

| 文件（相对各包根） | SHA-256 |
|---|---|
| DSH `lib/types/client/index.d.ts` | `b64659fa31a4863922f8c5490d180b3c436e100da14c7ea7885581a3681145bf` |
| DSH `lib/types/client/service.d.ts` | `1c349e0c84a19e4b3a3135f4453bebc5fa1d8ff95b767bcb327ee2c007ed10a3` |
| Better Sidebar `lib/types/client/service.d.ts` | `807ef86eedb27a9413517958d7e94d74cf38cee0fb24ccba4243859da3cb4257` |

本报告没有 Session IDs、模型配置、题目正文、用户资料或截图。研究完成不等于生产缺陷关闭。
