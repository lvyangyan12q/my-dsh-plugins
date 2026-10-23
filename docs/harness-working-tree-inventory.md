# Harness 未提交文件现场核对

核对日期：2026-10-23。目标目录：`D:/programming/workspace/deepseek-harness`。本页保留清理前现场，并记录用户随后授权的清理结果。未提交原生文件，未启动或重建服务。

## 清理前现场

宿主版本为 `0.2.1-rc.3`，HEAD 为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。`git status --porcelain=v1 --untracked-files=all` 共 321 项：318 个未跟踪文件，3 个跟踪文件删除；没有跟踪文件的修改或暂存变更。

| 分类 | 数量 | 证据与含义 |
| --- | ---: | --- |
| 源文件旁编译产物 | 316 | 79 组 `.js`、`.js.map`、`.d.ts`、`.d.ts.map`；均于 2026-10-23 23:41 创建，分布于 16 个 packages 子包的 src；79 份 JS source map 全部指向现有 TypeScript/TSX 源文件 |
| 考公本地文件 | 2 | `.dsh/skills/kaogong-teach/SKILL.md` 与 `kaogong.cordis.yml`；创建于 8 月，最后修改分别为 9 月 8 日、9 月 6 日，早于本轮 |
| vendor 跟踪文件删除 | 3 | `vendor/cordis/LICENSE`、`vendor/cordis/bin.js`、`vendor/include/LICENSE`；不是正常的未跟踪构建产物 |

编译产物的类别可以由内容和 source map 确认，不能据此推断用户手动修改。抽查 `packages/api/remote-access/tsconfig.host.json` 指定输出到 `lib/types`，现场却有产物落在 `src`，因此需要追查生成它们的具体调用方式。当前证据不能确定是哪条命令或哪个进程生成；前期实施存在构建、依赖安装及临时目录清理，不能将这些变化归因于用户。

3 个 vendor 删除项的直接触发操作尚未确定。它们在本轮适配开始的只读快照中已存在；这只证明发现时间，不能证明前期操作与之无关。不能把先前“未修改原生源码”的描述扩大为“原生目录从未产生构建、依赖或清理副作用”。

## 清理处理顺序

1. 保存当前精确路径清单、文件哈希、时间及 Git 基线到私有备份，不能只按扩展名批量删除。
2. 将已核实的 316 个生成文件从精确清单移至仓库外隔离目录，并保留可恢复映射；这不影响对应 TS/TSX 原文件，但运行前仍需用官方构建补齐正确产物。
3. 对 3 个删除项从当前 HEAD 提取到临时目录进行比对，确认没有需要保留的本地版本后，再定向恢复这 3 个路径；不执行全仓库 reset。
4. 保留两个考公本地文件，先检查是否仍被启动或资料引用。它们不属于新工作台安装必需步骤，也不因未跟踪就自动删除。
5. 核对状态只减少预期项，查明编译产物落入 src 的原因后再构建。若复现，保留触发命令并修正插件侧构建引用或使用方式；不能通过忽略文件隐藏问题。

清单、备份、316 个精确文件移动及 3 个跟踪文件恢复已按用户授权执行，两个考公本地文件保留。生成产物的具体触发命令仍待查明，本次未重新构建或启动服务。工作台安装与数据目录说明见[接入说明](worktable-integration.md)。

## 授权清理结果

- 316 个生成文件已逐个移至仓库外私有备份，移动前后 SHA256 全部一致；保留原相对路径和清理清单，可按清单恢复。
- 3 个缺失 vendor 跟踪文件仅从当前 HEAD 定向恢复，没有执行全仓库 reset 或 clean；恢复后跟踪文件差异为空，HEAD 未改变。
- 79 份对应 TS/TSX 源文件及两个考公历史文件哈希保持。考公 Skill 路径含既有目录链接，只读核对，未移动链接或目标。
- 最终未提交状态只有 `?? .dsh/skills/kaogong-teach/SKILL.md` 和 `?? kaogong.cordis.yml`；这两个历史文件没有删除、提交或通过忽略规则隐藏。
- 本次未重装依赖，未改 DSH home、模型配置、会话、存储或资料，未重新启动实例。

私有备份目录 basename 为 `harness-cleanup-20261023-362b0544`，位于本机 C 盘任务目录的 `.local` 下；清单文件为 `cleanup.private.json`，SHA256 为 `50a47f7266b22034e9160dd18cc5f8d108bc1d3296316c95cebc2f6fd7e02c43`。备份与私有清单不进入产品仓库。

## 追加清理：旧考公 overlay

随后核对确认，原生根目录 `kaogong.cordis.yml` 由旧 `plugins/kaogong/scripts/install.mjs` 生成，指向旧的 `./kaogong/src/index.ts`，并声明单独的存储栈。当前标准 web 启动脚本与正式 profile 不引用该 overlay。按用户“该清理就清理”的授权，已移至同一私有备份目录的 `legacy-config/kaogong.cordis.yml`，移动前后哈希一致；独立记录为 `legacy-kaogong-config.private.json`。

正式 web profile 的 `package.json`、`cordis.patch.yml`、`cordis.yml` 哈希保持，考公插件源码、资料、存储和旧会话未改。当前原生仓库只剩 `?? .dsh/skills/kaogong-teach/SKILL.md`，跟踪文件无差异；前述“两文件保留”描述为第一次清理检查点。旧安装脚本保留作历史，后续适配不再使用它往原生目录复制代码或生成此 overlay。

## 复核命令

```powershell
git -C 'D:/programming/workspace/deepseek-harness' rev-parse HEAD
git -C 'D:/programming/workspace/deepseek-harness' status --porcelain=v1 --untracked-files=all
git -C 'D:/programming/workspace/deepseek-harness' diff --stat
git -C 'D:/programming/workspace/deepseek-harness' diff --cached --stat
```

不要用 `git clean -fdx`、`git reset --hard`、全仓库恢复或递归删除清理这个现场。资料、配置、编译残留与跟踪文件删除应分别处理。
