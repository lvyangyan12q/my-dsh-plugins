# Code review · Spec 轴

范围：`git diff 2560c41...HEAD`，对照 `docs/wayfinder/window3-dispatch/spec.md` 行号。

## (a) 缺失 / 部分实现

1. 产物链缺失：`run.artifacts` 从不写入，无产物读取/下载接口（L112,170,24）；方案卡只有 `round-N/plan.md` 路径、审核卡只有结论标签，看不到方案正文与 blocking，人工闸门形同虚设（L117,118）；L260 的 manifest 校验（逃逸/大小/sha256/branch-commit）无实现无测试。
2. 无 `request-changes` 路由（L111 明列）；页面「要求再改」调 `plan-feedback`，在 `awaiting_user_approval` 必 409（L118）。
3. `needs_attention` 断链：`resume()` 未接路由且 pending 已清，用户回答后的 `turn/end` 被忽略，循环永久停（L200,213,214,301）——**最严重**。
4. `writeBack` 桥侧无实现；`allowedRoots` 只取插件配置、不读窗口2 localPath（L40,226）→ 装好后 start 一律 422。

## (b) 越界

- `host.js` 硬编码 15s prompt 超时默认值（L96,293 明确无固定超时）。
- verdict 额外收 `blocked`、`forked` 归 unknown。
- 窗口2 顺带修票外编辑器保存/空配置崩溃（属于顺手 bug 修复，记录为 scope creep）。

## (c) 似实现而错

- `publicRun` 剥 `draft`，页面按 `run.bug/connection/project` 渲染 → 真实 run 标题空、连接/项目显示「—」（L118）。
- 页面读 `needsAttention`/`review.*`，桥写 `attention`/`reviewBlocking`/`reviewSummary` → 真实原因与必改项不显示（L42,118）。
- 「加载更早」用 cursor 向后取新，方向反。

## 最严重

③ `needs_attention` 无法继续：spec 两处称其为硬闸门并要求「回答后从当前阶段继续」，实现只回写 state，既不重发 prompt 也无法再收到 `turn/end`，唯一出路是 Stop 开新 run——自动审核↔修复循环在第一次暂停即终止。
