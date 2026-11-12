# 08 构建、打包与安装记录 — 2026-11-12

**结论：构建、打包、安装与源码回归已完成；浏览器实机验收未做，本记录不构成票 08 验收通过。**

本记录只证明「新包已装进 web profile 且与所构建源码一致」，不证明学习路径走通。未验证项见末节。

## 环境

| 项 | 值 |
|---|---|
| 工作树 | `D:\programming\workspace\my-dsh-wt\t08` |
| 分支 / HEAD | `ticket-08-acceptance` / `d1dedd0`（`Merge branch 'ticket-05-practice-closeout' into feat/kaogong-task-classroom`） |
| 构建前工作树 | 干净（无已跟踪改动） |
| Node / npm | v25.2.0 / 11.6.2 |
| 宿主 | 官方 checkout `D:\programming\workspace\deepseek-harness`，`@deepseek-ai/dsh` 0.2.2-rc.1（根包 0.2.2-rc.1） |
| 目标 profile | `C:\Users\pc-zzy\.dsh\profiles\web`（日常 3080 使用中的 web profile） |
| 3080 | **未重启**；安装后运行中的进程仍是旧包，故本记录不含「运行中的 3080 已加载新包」的结论 |

## 构建方式与绕开 build.mjs 的原因

`node scripts/build.mjs` 必然失败：它要求 `tsdown` / `typescript` 的 realpath 落在**插件自己的** `node_modules` 下，否则抛 `PLUGIN_PHYSICAL_BUILD_TOOLS_REQUIRED`。本工作树的 `node_modules` 是指向 `D:\programming\workspace\my-dsh\node_modules` 的 junction，两个工具因此解析到仓库根/宿主安装目录，守卫必然拒绝。

处置：**未安装依赖、未修改 build.mjs 守卫**，改为按 build.mjs 的步骤直接调用同一套工具：

```powershell
cd D:\programming\workspace\my-dsh-wt\t08\plugins\kaogong
$env:DSH_SOURCE='D:\programming\workspace\deepseek-harness'
$tsdown = node -e "console.log(require.resolve('tsdown/run'))"
node $tsdown -c tsdown.host.config.ts      # lib/index.js (ESM)
node $tsdown -c tsdown.config.ts           # lib/client.js (CJS 包装)
node scripts/check-client-types.mjs --emit # lib/types/*.d.ts
node scripts/check-host-types.mjs --emit
Copy-Item src\*.d.mts lib\types            # 与 build.mjs 末尾一致
```

产物：`lib/index.js` 443477 bytes、`lib/client.js` 523315 bytes，`lib/` 共 108 个文件，其中 `lib/types/index.d.ts`、`lib/types/client.d.ts` 均存在（对应 `exports`）。

| 产物 | SHA-256 |
|---|---|
| `lib/client.js` | `2A5CFE12E1ABB46356F13F8A18EB5B7D13846BA5275AA0A689705AC754FDF79D` |
| `lib/index.js` | `3032BB59313B1BE9F197C2BDC92886FEC5400465D9A32DF0F2A6D885E263596D` |

## 构建与源码一致性依据

1. **确定性重建**：清空后首次构建，再原地重跑两个 tsdown 配置，`client.js` / `index.js` 的 SHA-256 与首次完全相同。
2. **时间戳**：两个 bundle 的修改时间均晚于 `src/` 下全部源文件的最新修改时间，不存在用旧产物打包的情况。
3. **新功能标记（解码 `\uXXXX` 后在产物中搜索，esbuild 会转义中文）**：

| 功能 | client 标记 | host 标记 |
|---|---|---|
| 内嵌答疑 | `老师答疑`、`与任务同一原生会话` | — |
| 任务直达 | `今日任务`、`继续最近任务` | — |
| 任务会话 | `任务会话尚未就绪` | `任务会话参数无效`、`任务会话所有者不可用`、`任务课堂身份已变化`、`课堂会话的角色与任务不一致` |
| 固定角色 | `老师负责本任务的讲课、答疑与讲评`、`找班主任讨论安排`、`kg-history-note` | `考公持续课堂角色` |
| 收尾 | `学习收尾`、`收尾保存失败` | `同一收尾操作的确认冲突`、`不能自动加入回忆` |

10 个 client 标记、7 个 host 标记全部命中（`ALL MARKERS PRESENT`）。

4. **打包/安装逐字节一致**：tgz 内 118 个文件与 staging 的 118 个文件哈希 0 差异；装进 profile 的 118 个文件与 staging 哈希 0 差异（含 `lib/index.js`、`lib/client.js`、`package.json`）。

## 测试与类型检查

测试环境：

```powershell
$env:TSX_TSCONFIG_PATH='D:\programming\workspace\my-dsh-wt\t08\plugins\kaogong\tsconfig.test-client.json'
$env:DSH_SOURCE='D:\programming\workspace\deepseek-harness'
```

关键回归（票 08 指定文件）：

```powershell
node --import tsx/esm --test tests/practice-closeout.test.tsx tests/classroom-empty-practice.test.tsx tests/task-classroom.test.tsx tests/embedded-teacher-session.test.tsx tests/task-session-binding.test.tsx tests/fixed-roles.test.tsx tests/lesson-content-correctness.test.tsx tests/standalone-host.test.mjs
```

结果：**68 tests / 68 pass / 0 fail**（duration 10.6s）。

另跑全量 `node scripts/test-current.mjs`：**148 tests / 148 pass / 0 fail**（host 69 + client 74 + integration 5）。集成分支此前记录的 126/126 是更早口径；本轮实测用例数已增至 148，未出现失败项。

类型检查（均通过）：

```powershell
node scripts/check-client-types.mjs   # Kaogong Client: official public declarations passed
node scripts/check-host-types.mjs     # Kaogong Host: official public declarations passed
```

## 打包

`scripts/pack-release.mjs` 未使用：它要求 `DSH_SOURCE` 指向干净官方 checkout、跑全量 pack 门禁并把版本断言为 `0.4.1-rc.1.3`，本机不满足，且会写入 `releases/`。改用隔离打包：

- staging：`plugins/kaogong/.scratch/task08-package/staging`（按 `package.json` 的 `files` 白名单复制 118 个文件，版本改为 `0.4.1-rc.1.3.t08pkg.1794490234668`，与已装的 `0.4.1-rc.1.3.localtest.1794123932321` 及 `releases/` 内任何包均不同）
- 输出：`npm pack --ignore-scripts --pack-destination .scratch/task08-package/output`
- `releases/` 未新增、未覆盖任何文件

| 项 | 值 |
|---|---|
| 包绝对路径 | `D:\programming\workspace\my-dsh-wt\t08\plugins\kaogong\.scratch\task08-package\output\deepseek-ai-dsh-tool-kaogong-0.4.1-rc.1.3.t08pkg.1794490234668.tgz` |
| 版本 | `0.4.1-rc.1.3.t08pkg.1794490234668` |
| 大小 | 308365 bytes |
| 文件数 | 118 |
| SHA-256 | `1A1F6C162687492DADD08F1C49E3427C761EDABE65F4518391C7D77D9CCE32FE` |

包位于 `.scratch/`（仓库 `.gitignore` 忽略），清理该工作树后需重新打包；回退/重装时不要删除该 tgz。

## 安装与读回

安装走插件管理器 `install_bundle`，目标 `file:<上面的 tgz 绝对路径>`。pnpm v11.28.5 输出 `Packages: +1`、`Done in 5.2s`，退出码 0。

profile 依赖变化（`C:\Users\pc-zzy\.dsh\profiles\web\package.json`，仅此一处变化）：

```text
- "@deepseek-ai/dsh-tool-kaogong": "file:D:/programming/workspace/my-dsh/plugins/kaogong/.scratch/local-package-27c5188b-75e1-4e6a-9bc2-c2edf47d0fc3/output/deepseek-ai-dsh-tool-kaogong-0.4.1-rc.1.3.localtest.1794123932321.tgz"
+ "@deepseek-ai/dsh-tool-kaogong": "file:D:/programming/workspace/my-dsh-wt/t08/plugins/kaogong/.scratch/task08-package/output/deepseek-ai-dsh-tool-kaogong-0.4.1-rc.1.3.t08pkg.1794490234668.tgz"
```

`profiles/web/pnpm-lock.yaml` 同步指向新 tgz。`profiles/web/cordis.patch.yml` **未变化**（`roleCwd`、`questionImageRoot`、`mineru.outputDir`、`materialSourceHome`、`legacyMaterialRoot` 等站点配置保留）。

读回确认：

| 检查 | 结果 |
|---|---|
| `node_modules/@deepseek-ai/dsh-tool-kaogong/package.json` 的 version | `0.4.1-rc.1.3.t08pkg.1794490234668` |
| 安装目录形态 | 真实目录（非 link），118 个文件 |
| 安装目录 vs staging | 118/118 文件 SHA-256 相同，0 差异 |
| `lib/index.js` / `lib/client.js` | 与构建产物哈希一致（见上表） |

## 未验证项（全部未做，不得写成已完成）

- **浏览器/实机**：3080 未重启，运行中的进程仍是旧包；新包在真实页面是否加载、界面是否出现新功能，均未验证。
- **真实模型**：课堂答疑的真实模型调用未验证。
- **流式输出**：未验证。
- **审批**：工具审批（拒绝/允许一次）未验证。
- **Stop**：真实停止行为未验证。
- **窄屏**：窄屏布局、多视图切换未验证。
- **刷新 / 重开 / 冷启动**：任务、作答、会话、草稿的恢复未验证。
- **重装恢复**：未做同包重装或升级后再恢复的验证；安装本身只是一次 `file:` 依赖替换。
- **多档案隔离**：A/B 学习者档案隔离未验证。
- **完整学习路径**：今日任务→课堂→讲课/答疑→练习→收尾→复习，未走通。
- **门禁**：未执行 `pack-release.mjs` 的全量 pack 门禁，也未执行 `scripts/check-installed-identity.mjs` 的独立 home 安装身份门禁；本次是装入现有 web profile，不是隔离实例验收。
- **回退**：未执行新包→旧包的降级验证。

票 08 的复选框（真实学习者路径、真实模型答疑含流式/停止/审批、刷新与重装恢复、窄屏与多视图、验收记录）均未被本记录满足。
